import { StatusBar } from 'expo-status-bar';
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  ImageBackground,
  FlatList,
  Modal,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeIntent, ConversationTurn } from './src/agents/IntentAgent';
import { discoverProviders } from './src/agents/DiscoveryAgent';
import { rankProviders, RankedProvider } from './src/agents/RankingAgent';
import { simulateBooking, BookingReceipt } from './src/agents/BookingAgent';
import { scheduleFollowUp, clearFollowUpTimers, FollowUpTimers } from './src/agents/FollowUpAgent';
import { MOCK_PROVIDERS } from './src/data/mockProviders';

const FAQ_DATA = [
  { q: 'Haazir kaise kaam karta hai?', a: 'Aap apni zaroorat type karein, Haazir AI aapke liye sabse qareeb aur behtareen provider dhundh kar booking confirm karta hai.' },
  { q: 'Payment ke kya options hain?', a: 'Filhaal cash on delivery. Digital payments jald aa rahe hain!' },
  { q: 'Kya main booking cancel kar sakta hoon?', a: 'Haan! Booking card par "Cancel Request" button dabayein. Haazir khud se dusra provider dhundh lega.' },
  { q: 'Provider ki rating kaise hoti hai?', a: 'Har kaam ke baad user feedback deta hai. Yeh rating ranking mein use hoti hai.' },
  { q: 'Kya Haazir sirf Islamabad mein kaam karta hai?', a: 'Prototype abhi Islamabad (G-13) ke ird-gird hai. Jald aur sheher shamil honge.' },
];

const { width } = Dimensions.get('window');

const COLORS = {
  primary: '#01411C',       // Pakistan Green
  primaryLight: '#026B2E',
  secondary: '#E9C46A',     // Warm Sand
  background: '#EFEEE8',    // Warm canvas
  surface: '#FFFFFF',
  text: '#1A1A1A',
  textLight: '#7A7A7A',
  userBubble: '#01411C',
  aiBubble: '#F5F4EF',
  canceled: '#D4D4D4',
};

// ─── Message Types ───
interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  type: 'text' | 'booking_card';
  content: any;
  status?: 'CONFIRMED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELED' | 'FEEDBACK';
  provider?: RankedProvider;
  receipt?: BookingReceipt;
  eta?: number;
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rankedProviders, setRankedProviders] = useState<RankedProvider[]>([]);
  const [providerIndex, setProviderIndex] = useState(0);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showProviderPortal, setShowProviderPortal] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const chatRef = useRef<FlatList>(null);
  const timersRef = useRef<Map<string, FollowUpTimers>>(new Map());

  // Offline queue
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        AsyncStorage.getItem('@offline_request_queue').then(q => {
          if (q) {
            AsyncStorage.removeItem('@offline_request_queue');
            handleSearch(q);
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [messages.length]);

  const genId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  const pushMessage = (msg: Omit<ChatMessage, 'id'>) => {
    const newMsg = { ...msg, id: genId() };
    setMessages(prev => [...prev, newMsg]);
    return newMsg.id;
  };

  const updateMessageById = (id: string, updates: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  // ─── Pipeline ───
  const initiatePipeline = async (provider: RankedProvider): Promise<string> => {
    const receipt = await simulateBooking(provider);
    
    const cardId = pushMessage({
      role: 'ai',
      type: 'booking_card',
      content: receipt,
      status: 'CONFIRMED',
      provider,
      receipt,
      eta: receipt.eta_minutes,
    });

    // Schedule timeline: only IN_TRANSIT auto-fires; completion is manual via Provider Portal
    const timers = scheduleFollowUp(
      receipt,
      () => updateMessageById(cardId, { status: 'IN_TRANSIT', eta: 12 }),
      () => {} // No auto-complete — provider must manually mark complete
    );
    // Clear the feedbackTimer immediately since we don't want auto-complete
    clearTimeout(timers.feedbackTimer);
    timersRef.current.set(cardId, timers);

    return cardId;
  };

  const handleSearch = async (queryToSearch = searchQuery) => {
    if (typeof queryToSearch !== 'string' || !queryToSearch.trim()) return;

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      await AsyncStorage.setItem('@offline_request_queue', queryToSearch);
      pushMessage({ role: 'ai', type: 'text', content: '📡 You are offline. Your request has been queued and will process once you reconnect.' });
      return;
    }

    // Push user message bubble
    pushMessage({ role: 'user', type: 'text', content: queryToSearch });
    setSearchQuery('');
    setIsSearching(true);

    try {
      // Build conversation history from text messages for context
      const history: ConversationTurn[] = messages
        .filter(m => m.type === 'text')
        .map(m => ({ role: m.role as 'user' | 'ai', content: m.content as string }));

      const intent = await analyzeIntent(queryToSearch, history);

      if (!intent.is_complete) {
        // Conversational clarification — no Alert!
        pushMessage({
          role: 'ai',
          type: 'text',
          content: intent.clarification_question || 'Please provide more details about the service, location, and time.',
        });
        setIsSearching(false);
        return;
      }

      if (intent.service_type) {
        pushMessage({ role: 'ai', type: 'text', content: `🔍 Searching for ${intent.service_type} providers near ${intent.location || 'your location'}...` });

        const discoveryResult = await discoverProviders(intent.service_type);
        const discovered = discoveryResult.providers;

        if (discoveryResult.expanded_search) {
          pushMessage({ role: 'ai', type: 'text', content: '📍 No providers in your immediate area. Expanded search radius to find a match.' });
        }

        const ranked = await rankProviders(discovered);

        if (ranked.length > 0) {
          setRankedProviders(ranked);
          setProviderIndex(0);
          pushMessage({ role: 'ai', type: 'text', content: `✅ Found ${ranked.length} providers. Booking top match...` });
          await initiatePipeline(ranked[0]);
        } else {
          pushMessage({ role: 'ai', type: 'text', content: `😔 We couldn't find any ${intent.service_type} providers near your location. Please try a different area.` });
        }
      }
    } catch (error) {
      pushMessage({ role: 'ai', type: 'text', content: '⚠️ Something went wrong while processing your request. Please try again.' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleCancelCard = async (cardId: string) => {
    // Clear timers to prevent ghost transitions
    const timers = timersRef.current.get(cardId);
    if (timers) {
      clearFollowUpTimers(timers);
      timersRef.current.delete(cardId);
    }

    const canceledMsg = messages.find(m => m.id === cardId);
    updateMessageById(cardId, { status: 'CANCELED' });

    const providerName = canceledMsg?.receipt?.provider_name || 'Provider';
    pushMessage({ role: 'ai', type: 'text', content: `❌ ${providerName} canceled. Haazir is finding a replacement...` });

    const nextIndex = providerIndex + 1;
    setProviderIndex(nextIndex);

    if (nextIndex < rankedProviders.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const nextProvider = rankedProviders[nextIndex];
      pushMessage({ role: 'ai', type: 'text', content: `🔄 Re-routing to ${nextProvider.name}...` });
      await initiatePipeline(nextProvider);
    } else {
      pushMessage({ role: 'ai', type: 'text', content: '⚠️ All nearby alternative technicians are currently occupied. Please try again shortly.' });
    }
  };

  const handleFeedback = (cardId: string) => {
    updateMessageById(cardId, { status: 'COMPLETED' });
    const stars = reviewRating > 0 ? `${'⭐'.repeat(reviewRating)}` : '';
    const text = reviewText.trim() ? ` — "${reviewText.trim()}"` : '';
    pushMessage({ role: 'ai', type: 'text', content: `🙏 Thank you for your ${stars} rating${text}! Haazir is always ready.` });
    setReviewRating(0);
    setReviewText('');
  };

  // Provider Portal: mark active job complete
  const handleProviderComplete = () => {
    const activeCard = [...messages].reverse().find(m => m.type === 'booking_card' && (m.status === 'CONFIRMED' || m.status === 'IN_TRANSIT'));
    if (activeCard) {
      const timers = timersRef.current.get(activeCard.id);
      if (timers) { clearFollowUpTimers(timers); timersRef.current.delete(activeCard.id); }
      updateMessageById(activeCard.id, { status: 'FEEDBACK' });
      setShowProviderPortal(false);
    }
  };

  // ─── Renderers ───

  const renderBookingCard = (item: ChatMessage) => {
    const isCanceled = item.status === 'CANCELED';
    const isCompleted = item.status === 'COMPLETED';
    const isFeedback = item.status === 'FEEDBACK';
    const isTransit = item.status === 'IN_TRANSIT';
    const provider = item.provider;
    const receipt = item.receipt;

    if (isFeedback) {
      return (
        <View style={[styles.bookingCard, { borderColor: COLORS.secondary }]}>
          <Text style={styles.feedbackTitle}>✨ Service Completed!</Text>
          <Text style={styles.feedbackSub}>How was your experience with {receipt?.provider_name}?</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(s => (
              <TouchableOpacity key={s} onPress={() => setReviewRating(s)}>
                <Ionicons name={s <= reviewRating ? 'star' : 'star-outline'} size={36} color={COLORS.secondary} />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.reviewInput}
            placeholder="Kuch aur batana chahenge? (Optional)"
            placeholderTextColor="#AAA"
            value={reviewText}
            onChangeText={setReviewText}
            multiline
          />
          {reviewRating > 0 && (
            <TouchableOpacity style={styles.submitReviewBtn} onPress={() => handleFeedback(item.id)}>
              <Text style={styles.submitReviewText}>Submit Feedback</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View style={[styles.bookingCard, isCanceled && styles.bookingCardCanceled]}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusDot, isTransit ? { backgroundColor: '#F59E0B' } : isCanceled ? { backgroundColor: '#999' } : isCompleted ? { backgroundColor: '#10B981' } : { backgroundColor: COLORS.primary }]} />
          <Text style={[styles.statusLabel, isCanceled && { color: '#999' }]}>
            {isCanceled ? '🚫 CANCELED' : isCompleted ? '✅ COMPLETED' : isTransit ? '🛵 IN TRANSIT' : '🟢 CONFIRMED'}
          </Text>
        </View>
        <Text style={[styles.cardProviderName, isCanceled && { color: '#999' }]}>{receipt?.provider_name}</Text>
        <Text style={[styles.cardServiceType, isCanceled && { color: '#BBB' }]}>{receipt?.service_type}</Text>

        {!isCanceled && provider && (
          <View style={styles.metricsBox}>
            <Text style={styles.metricLine}>⭐ {provider.rating} | {provider.completed_jobs} Jobs</Text>
            <Text style={styles.metricLine}>📍 {provider.distance_km.toFixed(1)} km away</Text>
            <Text style={styles.metricLine}>💰 Estimated Fare: Rs. 850</Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.etaBadge}>
            <Feather name="clock" size={12} color={COLORS.primary} />
            <Text style={styles.etaLabel}>ETA: {isCanceled ? '--' : item.eta} mins</Text>
          </View>
          <Text style={styles.cardIdLabel}>ID: {receipt?.booking_id}</Text>
        </View>

        {!isCanceled && !isCompleted && !isFeedback && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancelCard(item.id)}>
            <Text style={styles.cancelBtnText}>❌ Cancel Request</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    if (item.type === 'booking_card') {
      return (
        <View style={styles.aiRow}>
          {renderBookingCard(item)}
        </View>
      );
    }

    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.aiRow]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.bubbleText, isUser ? styles.userText : styles.aiText]}>{item.content}</Text>
        </View>
      </View>
    );
  };

  // ─── Provider Directory Modal ───
  const activeBookingForPortal = [...messages].reverse().find(m => m.type === 'booking_card' && (m.status === 'CONFIRMED' || m.status === 'IN_TRANSIT'));

  const renderProviderModal = () => (
    <Modal visible={showProviderModal} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {!showProviderPortal ? (
            <>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>📋 Provider Directory</Text>
                <TouchableOpacity onPress={() => setShowProviderModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={MOCK_PROVIDERS}
                keyExtractor={p => p.id}
                renderItem={({ item: p }) => (
                  <View style={styles.providerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.providerName}>{p.name}</Text>
                      <Text style={styles.providerMeta}>{p.service_type} · ⭐ {p.rating} · {p.completed_jobs} jobs</Text>
                    </View>
                    <View style={[styles.availDot, { backgroundColor: p.is_available ? '#10B981' : '#EF4444' }]} />
                  </View>
                )}
              />
              <TouchableOpacity style={styles.portalBtn} onPress={() => setShowProviderPortal(true)}>
                <Text style={styles.portalBtnText}>👨‍🔧 Switch to Provider Portal</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>👨‍🔧 Provider Portal</Text>
                <TouchableOpacity onPress={() => { setShowProviderPortal(false); setShowProviderModal(false); }}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 24, alignItems: 'center' }}>
                {activeBookingForPortal ? (
                  <>
                    <Text style={{ fontSize: 16, color: COLORS.text, marginBottom: 8, fontWeight: '700' }}>
                      Active Job: {activeBookingForPortal.receipt?.provider_name}
                    </Text>
                    <Text style={{ fontSize: 14, color: COLORS.textLight, marginBottom: 4 }}>
                      Service: {activeBookingForPortal.receipt?.service_type}
                    </Text>
                    <Text style={{ fontSize: 13, color: COLORS.textLight, marginBottom: 24 }}>
                      ID: {activeBookingForPortal.receipt?.booking_id}
                    </Text>
                    <TouchableOpacity style={styles.completeJobBtn} onPress={handleProviderComplete}>
                      <Text style={styles.completeJobText}>✅ Mark Job as Completed</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={{ fontSize: 15, color: COLORS.textLight, textAlign: 'center', marginTop: 40 }}>No active bookings right now.</Text>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  // ─── FAQ Modal ───
  const renderFaqModal = () => (
    <Modal visible={showFaqModal} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>❓ FAQ</Text>
            <TouchableOpacity onPress={() => setShowFaqModal(false)}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={FAQ_DATA}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item: faq, index }) => (
              <TouchableOpacity style={styles.faqItem} onPress={() => setExpandedFaq(expandedFaq === index ? null : index)}>
                <View style={styles.faqQRow}>
                  <Text style={styles.faqQ}>{faq.q}</Text>
                  <Ionicons name={expandedFaq === index ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textLight} />
                </View>
                {expandedFaq === index && <Text style={styles.faqA}>{faq.a}</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ImageBackground
          source={{ uri: 'https://www.transparenttextures.com/patterns/cubes.png' }}
          style={styles.container}
          imageStyle={{ opacity: 0.04 }}
        >
          {/* HEADER */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>حاضر</Text>
              <Text style={styles.headerTagline}>Haazir aapke liye haazir hai</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.directoryBtn} onPress={() => setShowFaqModal(true)}>
                <Ionicons name="help-circle-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.directoryBtn} onPress={() => setShowProviderModal(true)}>
                <MaterialCommunityIcons name="database-search-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* CHAT AREA */}
          <FlatList
            ref={chatRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.chatList}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyTitle}>Haazir AI</Text>
                <Text style={styles.emptySub}>Your autonomous on-demand service companion.</Text>
                <Text style={styles.emptyHint}>Type a request below to get started.</Text>
              </View>
            }
            onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
          />

          {/* LOADING INDICATOR */}
          {isSearching && (
            <View style={styles.typingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.typingText}>Haazir is thinking...</Text>
            </View>
          )}

          {/* BOTTOM INPUT */}
          <View style={styles.inputWrapper}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder="Message Haazir..."
                placeholderTextColor={COLORS.textLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => handleSearch()}
                returnKeyType="send"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ paddingHorizontal: 6 }}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textLight} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.sendBtn, searchQuery.length === 0 && { opacity: 0.4 }]}
                onPress={() => handleSearch()}
                disabled={searchQuery.length === 0}
              >
                <Ionicons name="send" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        </ImageBackground>
      </KeyboardAvoidingView>
      {renderProviderModal()}
      {renderFaqModal()}
    </SafeAreaView>
  );
}

// ─── Styles ───
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 36 : 8,
    paddingBottom: 12,
    backgroundColor: COLORS.primary,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 1,
  },
  headerTagline: {
    fontSize: 11,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.65)',
    marginTop: 1,
  },
  directoryBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 120,
  },
  emptyTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 15,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 40,
  },
  emptyHint: {
    fontSize: 13,
    color: '#AAA',
    fontStyle: 'italic',
  },
  bubbleRow: {
    marginBottom: 10,
    flexDirection: 'row',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  aiRow: {
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  bubble: {
    maxWidth: width * 0.78,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: COLORS.aiBubble,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  userText: {
    color: '#FFF',
  },
  aiText: {
    color: COLORS.text,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  typingText: {
    marginLeft: 8,
    color: COLORS.textLight,
    fontSize: 13,
    fontStyle: 'italic',
  },
  // ─── Booking Card ───
  bookingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(1, 65, 28, 0.15)',
    maxWidth: width * 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  bookingCardCanceled: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.6,
  },
  cardProviderName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 3,
  },
  cardServiceType: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 14,
  },
  metricsBox: {
    backgroundColor: '#F8FAF8',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  metricLine: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 5,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(1, 65, 28, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  etaLabel: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
    marginLeft: 5,
  },
  cardIdLabel: {
    fontSize: 10,
    color: '#BBB',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cancelBtn: {
    marginTop: 16,
    backgroundColor: '#FFF1F2',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#E11D48',
    fontSize: 13,
    fontWeight: '700',
  },
  // ─── Feedback inside card ───
  feedbackTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  feedbackSub: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 16,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  // ─── Input Bar ───
  inputWrapper: {
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 14,
    paddingTop: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    paddingLeft: 18,
    paddingRight: 6,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ─── Modal ───
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F8F8',
  },
  providerName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  providerMeta: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  availDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 12,
  },
  reviewInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: COLORS.text,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  submitReviewBtn: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitReviewText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  portalBtn: {
    margin: 16,
    backgroundColor: '#F0FFF4',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(1,65,28,0.2)',
  },
  portalBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  completeJobBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  completeJobText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  faqItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  faqQRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQ: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
    marginRight: 10,
  },
  faqA: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 19,
  },
});
