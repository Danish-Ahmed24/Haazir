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
  ImageBackground,
  FlatList,
  Modal,
  ScrollView,
  Image,
  Animated,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeIntent, ConversationTurn } from './src/agents/IntentAgent';
import { discoverProviders } from './src/agents/DiscoveryAgent';
import { rankProviders, RankedProvider } from './src/agents/RankingAgent';
import { simulateBooking, BookingReceipt } from './src/agents/BookingAgent';
import { scheduleFollowUp, clearFollowUpTimers, FollowUpTimers } from './src/agents/FollowUpAgent';
import { generateProvidersForLocation, Provider } from './src/data/mockProviders';

const FAQ_DATA = [
  { q: 'Haazir kaise kaam karta hai?', a: 'Aap apni zaroorat type karein, Haazir AI aapke liye sabse qareeb aur behtareen provider dhundh kar booking confirm karta hai.' },
  { q: 'Payment ke kya options hain?', a: 'Filhaal cash on delivery. Digital payments jald aa rahe hain!' },
  { q: 'Kya main booking cancel kar sakta hoon?', a: 'Haan! Booking card par "Cancel Request" button dabayein. Haazir khud se dusra provider dhundh lega.' },
  { q: 'Provider ki rating kaise hoti hai?', a: 'Har kaam ke baad user feedback deta hai. Yeh rating ranking mein use hoti hai.' },
  { q: 'Kya Haazir sirf Islamabad mein kaam karta hai?', a: 'Prototype abhi Islamabad (G-13) ke ird-gird hai. Jald aur sheher shamil honge.' },
];

const { width, height } = Dimensions.get('window');

type CancelReason = 'Taking too long' | 'Changed my mind' | 'Other' | null;



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
  pin?: string;
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
  // Cancel modal
  const [cancelModalCardId, setCancelModalCardId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<CancelReason>(null);
  const [cancelOtherText, setCancelOtherText] = useState('');
  // Calendar toast
  const calToastAnim = useRef(new Animated.Value(-80)).current;
  const [calToastVisible, setCalToastVisible] = useState(false);
  const [calToastMsg, setCalToastMsg] = useState('');
  // Location picker
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [pickedRegion, setPickedRegion] = useState({ latitude: 33.6454, longitude: 72.9868, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  const [pickedAddress, setPickedAddress] = useState('House 412, Street 12, G-13/2, Islamabad');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const geocodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Avatar loading
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({});
  const chatRef = useRef<FlatList>(null);
  const timersRef = useRef<Map<string, FollowUpTimers>>(new Map());
  const [localProviders, setLocalProviders] = useState<Provider[]>([]);

  useEffect(() => {
    setLocalProviders(generateProvidersForLocation(pickedRegion.latitude, pickedRegion.longitude));
  }, []);

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

  // ─── Real Geocoding ───
  const fetchRealAddress = async (lat: number, lng: number) => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setPickedAddress(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} (Missing API Key)`);
      setIsGeocoding(false);
      return;
    }
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`);
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        setPickedAddress(data.results[0].formatted_address);
      } else {
        setPickedAddress(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
      }
    } catch (err) {
      setPickedAddress(`Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleRegionChangeComplete = (region: any) => {
    setPickedRegion(region);
    setIsGeocoding(true);
    if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
    geocodeTimeoutRef.current = setTimeout(() => {
      fetchRealAddress(region.latitude, region.longitude);
    }, 800);
  };

  const resolveTextAddress = async (addressText: string) => {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;
    try {
      const queryText = addressText.toLowerCase().includes('pakistan') ? addressText : `${addressText}, Pakistan`;
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(queryText)}&components=country:PK&region=pk&key=${apiKey}`);
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const first = data.results[0];
        const { lat, lng } = first.geometry.location;
        const types: string[] = first.types || [];
        let isGeneric = !types.some(t => ['street_address', 'premise', 'subpremise', 'route', 'intersection'].includes(t));
        
        const addrLower = first.formatted_address.toLowerCase();
        const hasKeyword = ['garden', 'society', 'colony', 'town', 'chowk', 'road'].some(k => addrLower.includes(k));
        const hasCommas = (first.formatted_address.match(/,/g) || []).length >= 2;
        if (hasKeyword || hasCommas || first.formatted_address.length > 30) {
          isGeneric = false;
        }
        
        return { lat, lng, formattedAddress: first.formatted_address, isGeneric };
      }
    } catch (err) {
      console.error(err);
    }
    return null;
  };

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
      pin: Math.floor(1000 + Math.random() * 9000).toString(),
    });

    // Schedule timeline: only IN_TRANSIT auto-fires; completion is manual via Provider Portal
    const timers = scheduleFollowUp(
      receipt,
      () => updateMessageById(cardId, { status: 'IN_TRANSIT', eta: Math.max(1, receipt.eta_minutes - 5) }),
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
      pushMessage({ role: 'ai', type: 'text', content: '[Offline] You are offline. Your request has been queued and will process once you reconnect.' });
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
        let searchLat = pickedRegion.latitude;
        let searchLng = pickedRegion.longitude;
        let currentProviders = localProviders;

        if (intent.location) {
          const geocodeData = await resolveTextAddress(intent.location);
          if (geocodeData) {
            searchLat = geocodeData.lat;
            searchLng = geocodeData.lng;
            
            setPickedRegion(prev => ({ ...prev, latitude: searchLat, longitude: searchLng }));
            setPickedAddress(geocodeData.formattedAddress);
            
            const newProviders = generateProvidersForLocation(searchLat, searchLng);
            setLocalProviders(newProviders);
            currentProviders = newProviders;
            
            if (geocodeData.isGeneric) {
              pushMessage({
                role: 'ai',
                type: 'text',
                content: `I've found service providers near ${geocodeData.formattedAddress}! However, this area is quite broad. To ensure a technician arrives exactly at your doorstep with an accurate fare, could you reply with your street/block number, or simply tap the Map Pin icon in the top right?`
              });
              setIsSearching(false);
              return;
            }
          }
        }

        pushMessage({ role: 'ai', type: 'text', content: `[Searching] Searching for ${intent.service_type} providers near ${intent.location || 'your location'}...` });

        const discoveryResult = await discoverProviders(intent.service_type, searchLat, searchLng, currentProviders);
        const discovered = discoveryResult.providers;

        if (discoveryResult.expanded_search) {
          pushMessage({ role: 'ai', type: 'text', content: '[Expanded] No providers in your immediate area. Expanded search radius to find a match.' });
        }

        const ranked = await rankProviders(discovered);

        if (ranked.length > 0) {
          setRankedProviders(ranked);
          setProviderIndex(0);
          pushMessage({ role: 'ai', type: 'text', content: `[Found] Found ${ranked.length} providers. Booking top match...` });
          await initiatePipeline(ranked[0]);
        } else {
          pushMessage({ role: 'ai', type: 'text', content: `[Error] We couldn't find any ${intent.service_type} providers near your location. Please try a different area.` });
        }
      }
    } catch (error) {
      pushMessage({ role: 'ai', type: 'text', content: '[Error] Something went wrong while processing your request. Please try again.' });
    } finally {
      setIsSearching(false);
    }
  };

  const executeCancelCard = async (cardId: string, findReplacement: boolean) => {
    // Clear timers to prevent ghost transitions
    const timers = timersRef.current.get(cardId);
    if (timers) {
      clearFollowUpTimers(timers);
      timersRef.current.delete(cardId);
    }

    const canceledMsg = messages.find(m => m.id === cardId);
    updateMessageById(cardId, { status: 'CANCELED' });

    const providerName = canceledMsg?.receipt?.provider_name || 'Provider';
    pushMessage({ role: 'ai', type: 'text', content: `[Canceled] Request for ${providerName} was canceled.` });

    if (!findReplacement) return;

    pushMessage({ role: 'ai', type: 'text', content: `Haazir is finding a replacement...` });

    const nextIndex = providerIndex + 1;
    setProviderIndex(nextIndex);

    if (nextIndex < rankedProviders.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const nextProvider = rankedProviders[nextIndex];
      pushMessage({ role: 'ai', type: 'text', content: `[Re-routing] Transferring to ${nextProvider.name}...` });
      await initiatePipeline(nextProvider);
    } else {
      pushMessage({ role: 'ai', type: 'text', content: '[Alert] All nearby alternative technicians are currently occupied. Please try again shortly.' });
    }
  };

  const confirmCancelRequest = (cardId: string) => {
    setCancelReason(null);
    setCancelOtherText('');
    setCancelModalCardId(cardId);
  };

  const handleAddToCalendar = (receipt: BookingReceipt | undefined) => {
    if (!receipt) return;
    const msg = `Scheduled: ${receipt.service_type} with ${receipt.provider_name}`;
    setCalToastMsg(msg);
    setCalToastVisible(true);
    Animated.sequence([
      Animated.timing(calToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(calToastAnim, { toValue: -80, duration: 300, useNativeDriver: true }),
    ]).start(() => setCalToastVisible(false));
  };

  const handleConfirmLocation = () => {
    setShowLocationModal(false);
    setLocalProviders(generateProvidersForLocation(pickedRegion.latitude, pickedRegion.longitude));
    pushMessage({ role: 'ai', type: 'text', content: `Location set: ${pickedAddress}` });
  };

  const handleFeedback = (cardId: string) => {
    updateMessageById(cardId, { status: 'COMPLETED' });
    const stars = reviewRating > 0 ? `${reviewRating} star` : '';
    const text = reviewText.trim() ? ` — "${reviewText.trim()}"` : '';
    pushMessage({ role: 'ai', type: 'text', content: `Thank you for your ${stars} rating${text}! Haazir is always ready.` });
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

    const calculateFare = (serviceType: string, distanceKm: number) => {
      const baseRates: Record<string, number> = { 'Cleaning': 500, 'AC Technician': 800 };
      const baseRate = baseRates[serviceType] || 600;
      return Math.round(baseRate + (distanceKm * 50));
    };

    const estimatedFare = provider ? calculateFare(receipt?.service_type || provider.service_type, provider.distance_km) : 850;

    if (isFeedback) {
      return (
        <View style={[styles.bookingCard, { borderColor: COLORS.secondary }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 6 }}>
            <Ionicons name="sparkles" size={20} color={COLORS.text} style={{ marginRight: 6 }} />
            <Text style={styles.feedbackTitle}>Service Completed!</Text>
          </View>
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
            {isCanceled ? 'CANCELED' : isCompleted ? 'COMPLETED' : isTransit ? 'IN TRANSIT' : 'CONFIRMED'}
          </Text>
        </View>

        {/* PROVIDER INFO ROW */}
        <View style={styles.providerRowInfo}>
          <View style={styles.avatarWrapper}>
            {avatarErrors[provider?.id || ''] ? (
              <View style={[styles.avatarPlaceholder, isCanceled && { backgroundColor: '#DDD' }]}>
                <Ionicons name="person" size={24} color="#FFF" />
              </View>
            ) : (
              <View style={styles.avatarPlaceholder}>
                <ActivityIndicator size="small" color={COLORS.secondary} style={{ position: 'absolute' }} />
                <Image
                  source={{ uri: provider?.avatar_url }}
                  style={styles.avatarImage}
                  onError={() => setAvatarErrors(prev => ({ ...prev, [provider?.id || '']: true }))}
                />
              </View>
            )}
            {!isCanceled && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              </View>
            )}
          </View>
          <View style={styles.providerDetails}>
            <Text style={[styles.cardProviderName, isCanceled && { color: '#999' }]}>{receipt?.provider_name}</Text>
            <Text style={[styles.cardServiceType, isCanceled && { color: '#BBB' }]}>{receipt?.service_type}</Text>
          </View>
        </View>

        {!isCanceled && provider && (
          <View style={styles.metricsBox}>
            <View style={styles.metricLineContainer}>
               <Ionicons name="star" size={14} color="#F59E0B" />
               <Text style={styles.metricLineText}>{provider.rating} | {provider.completed_jobs} Jobs</Text>
            </View>
            <View style={styles.metricLineContainer}>
               <Ionicons name="location" size={14} color={COLORS.primary} />
               <Text style={styles.metricLineText}>{provider.distance_km.toFixed(1)} km away</Text>
            </View>
            <View style={styles.metricLineContainer}>
               <Ionicons name="wallet" size={14} color={COLORS.primary} />
               <Text style={styles.metricLineText}>Estimated Fare: Rs. {estimatedFare}</Text>
            </View>
            <Text style={styles.socialProofText}>"Bohot professional aur waqt par aaye." - Ali</Text>
          </View>
        )}

        {/* MAP VIEW REPLACED BY RAW COORDINATES FOR VERIFICATION */}
        {!isCanceled && !isCompleted && !isFeedback && provider && (
          <View style={styles.coordsContainer}>
            <Text style={styles.coordsText}>Provider Location: Lat {provider.base_lat.toFixed(5)}, Lng {provider.base_lng.toFixed(5)}</Text>
          </View>
        )}

        {!isCanceled && !isCompleted && !isFeedback && (
          <View style={styles.pinContainer}>
            <Text style={styles.pinTitle}>Job PIN: {item.pin || '1234'}</Text>
            <Text style={styles.pinSubtext}>Share this code with the technician to start the job.</Text>
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
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={styles.actionBtnCall} onPress={() => {
              setCalToastMsg('Connecting to provider securely...');
              setCalToastVisible(true);
              Animated.sequence([
                Animated.timing(calToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                Animated.delay(2000),
                Animated.timing(calToastAnim, { toValue: -80, duration: 300, useNativeDriver: true }),
              ]).start(() => setCalToastVisible(false));
            }}>
              <Ionicons name="call" size={16} color="#FFF" />
              <Text style={styles.actionBtnTextLight}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnMsg} onPress={() => {
              setCalToastMsg('Opening secure provider chat...');
              setCalToastVisible(true);
              Animated.sequence([
                Animated.timing(calToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                Animated.delay(2000),
                Animated.timing(calToastAnim, { toValue: -80, duration: 300, useNativeDriver: true }),
              ]).start(() => setCalToastVisible(false));
            }}>
              <Ionicons name="chatbubble" size={16} color={COLORS.primary} />
              <Text style={styles.actionBtnTextDark}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnCalendar} onPress={() => handleAddToCalendar(receipt)}>
              <Ionicons name="calendar" size={16} color={COLORS.primary} />
              <Text style={styles.actionBtnTextDark}>Calendar</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isCanceled && !isCompleted && !isFeedback && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => confirmCancelRequest(item.id)}>
            <Ionicons name="close" size={14} color="#E11D48" style={{ marginRight: 6 }} />
            <Text style={styles.cancelBtnText}>Cancel Request</Text>
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
    let iconName = null;
    let iconColor = COLORS.primary;
    let textContent = item.content;

    if (!textContent || String(textContent).trim() === '') return null;

    if (!isUser && typeof textContent === 'string') {
      if (textContent.startsWith('[Offline]')) { iconName = 'wifi'; textContent = textContent.replace('[Offline]', '').trim(); }
      else if (textContent.startsWith('[Searching]')) { iconName = 'search'; textContent = textContent.replace('[Searching]', '').trim(); }
      else if (textContent.startsWith('[Expanded]')) { iconName = 'map'; textContent = textContent.replace('[Expanded]', '').trim(); }
      else if (textContent.startsWith('[Found]')) { iconName = 'checkmark-circle'; iconColor = '#10B981'; textContent = textContent.replace('[Found]', '').trim(); }
      else if (textContent.startsWith('[Error]')) { iconName = 'alert-circle'; iconColor = '#E11D48'; textContent = textContent.replace('[Error]', '').trim(); }
      else if (textContent.startsWith('[Canceled]')) { iconName = 'close-circle'; iconColor = '#E11D48'; textContent = textContent.replace('[Canceled]', '').trim(); }
      else if (textContent.startsWith('[Re-routing]')) { iconName = 'git-branch-outline'; textContent = textContent.replace('[Re-routing]', '').trim(); }
      else if (textContent.startsWith('[Alert]')) { iconName = 'warning'; iconColor = '#F59E0B'; textContent = textContent.replace('[Alert]', '').trim(); }
    }

    return (
      <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.aiRow]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <View style={!isUser && iconName ? { flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'flex-start' } : {}}>
            {!isUser && iconName && <Ionicons name={iconName as any} size={15} color={iconColor} style={{ marginRight: 6, marginTop: 2 }} />}
            <Text style={[styles.bubbleText, isUser ? styles.userText : styles.aiText, !isUser && iconName && textContent.length > 0 ? { flexShrink: 1 } : {}]}>{textContent}</Text>
          </View>
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
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="list" size={24} color={COLORS.text} style={{ marginRight: 8 }} />
                  <Text style={styles.modalTitle}>Provider Directory</Text>
                </View>
                <TouchableOpacity onPress={() => setShowProviderModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={localProviders}
                keyExtractor={p => p.id}
                renderItem={({ item: p }) => (
                  <View style={styles.providerRow}>
                    <View style={styles.avatarWrapper}>
                      <View style={styles.avatarPlaceholderSm}>
                        {avatarErrors[p.id] ? (
                          <Ionicons name="person" size={18} color="#FFF" />
                        ) : (
                          <>
                            <ActivityIndicator size="small" color={COLORS.secondary} style={{ position: 'absolute' }} />
                            <Image source={{ uri: p.avatar_url }} style={styles.avatarImageSm}
                              onError={() => setAvatarErrors(prev => ({ ...prev, [p.id]: true }))} />
                          </>
                        )}
                      </View>
                      {p.is_available && (
                        <View style={[styles.verifiedBadge, { bottom: -2, right: -2 }]}>
                          <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.providerName}>{p.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Text style={styles.providerMeta}>{p.service_type} · </Text>
                        <Ionicons name="star" size={11} color="#F59E0B" />
                        <Text style={styles.providerMeta}> {p.rating} · {p.completed_jobs} jobs</Text>
                      </View>
                    </View>
                    <View style={[styles.availDot, { backgroundColor: p.is_available ? '#10B981' : '#EF4444' }]} />
                  </View>
                )}
              />
              <TouchableOpacity style={styles.portalBtn} onPress={() => setShowProviderPortal(true)}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="briefcase" size={18} color={COLORS.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.portalBtnText}>Switch to Provider Portal</Text>
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="briefcase" size={24} color={COLORS.text} style={{ marginRight: 8 }} />
                  <Text style={styles.modalTitle}>Provider Portal</Text>
                </View>
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
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="checkmark-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
                        <Text style={styles.completeJobText}>Mark Job as Completed</Text>
                      </View>
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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="help-circle" size={24} color={COLORS.text} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>FAQ</Text>
            </View>
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
              <TouchableOpacity style={styles.directoryBtn} onPress={() => setShowLocationModal(true)}>
                <Ionicons name="location-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
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

          {/* QUICK PROMPT CHIPS */}
          {!isSearching && messages.length < 2 && (
            <View style={styles.chipsWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContainer}>

                {["Need an Electrician", "AC Repair near me", "Plumber urgently"].map((prompt, idx) => (
                  <TouchableOpacity key={idx} style={styles.chipBtn} onPress={() => handleSearch(prompt)}>
                    <Text style={styles.chipText}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
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

      {/* ─── CANCEL MODAL ─── */}
      <Modal visible={cancelModalCardId !== null} transparent animationType="fade">
        <View style={styles.cancelModalOverlay}>
          <View style={styles.cancelModalBox}>
            <Feather name="alert-triangle" size={28} color="#E11D48" style={{ marginBottom: 10 }} />
            <Text style={styles.cancelModalTitle}>Cancel Service Request?</Text>
            <Text style={styles.cancelModalSub}>Select a reason so we can improve your experience.</Text>
            <View style={styles.cancelChipsRow}>
              {(['Taking too long', 'Changed my mind', 'Other'] as CancelReason[]).map(r => (
                <TouchableOpacity key={r!} style={[styles.cancelChip, cancelReason === r && styles.cancelChipActive]} onPress={() => setCancelReason(r)}>
                  <Text style={[styles.cancelChipText, cancelReason === r && styles.cancelChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {cancelReason === 'Other' && (
              <View style={styles.cancelOtherBox}>
                <TextInput
                  style={styles.cancelOtherInput}
                  placeholder="Tell us more... (optional)"
                  placeholderTextColor="#AAA"
                  value={cancelOtherText}
                  onChangeText={t => setCancelOtherText(t.slice(0, 150))}
                  multiline
                  maxLength={150}
                />
                <Text style={styles.cancelCharCount}>{cancelOtherText.length}/150</Text>
              </View>
            )}
            <View style={styles.cancelModalBtns}>
              <TouchableOpacity style={styles.cancelModalNevermind} onPress={() => setCancelModalCardId(null)}>
                <Text style={styles.cancelModalNevermindText}>Nevermind</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelModalFindNew, !cancelReason && { opacity: 0.4 }]}
                disabled={!cancelReason}
                onPress={() => { setCancelModalCardId(null); executeCancelCard(cancelModalCardId!, true); }}>
                <Text style={styles.cancelModalFindNewText}>New Provider</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelModalConfirm, !cancelReason && { opacity: 0.4 }]}
                disabled={!cancelReason}
                onPress={() => { setCancelModalCardId(null); executeCancelCard(cancelModalCardId!, false); }}>
                <Text style={styles.cancelModalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── LOCATION PICKER MODAL ─── */}
      <Modal visible={showLocationModal} animationType="slide">
        <View style={{ flex: 1 }}>
          <MapView
            style={{ flex: 1 }}
            initialRegion={pickedRegion}
            onRegionChangeComplete={handleRegionChangeComplete}
          />
          {/* Fixed centre pin */}
          <View style={styles.fixedPin} pointerEvents="none">
            <Ionicons name="location" size={40} color="#E11D48" />
          </View>
          {/* Address sheet */}
          <View style={styles.locationSheet}>
            <View style={styles.locationSheetHandle} />
            <Text style={styles.locationSheetLabel}>Selected Location</Text>
            <View style={styles.locationSheetAddressRow}>
              {isGeocoding ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="location-outline" size={18} color={COLORS.primary} />
              )}
              <Text style={styles.locationSheetAddress}>
                {isGeocoding ? 'Resolving real address...' : pickedAddress}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={styles.locationCancelBtn} onPress={() => setShowLocationModal(false)}>
                <Text style={styles.locationCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.locationConfirmBtn} onPress={handleConfirmLocation}>
                <Ionicons name="checkmark" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.locationConfirmText}>Confirm Location</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── CALENDAR TOAST ─── */}
      {calToastVisible && (
        <Animated.View style={[styles.calToast, { transform: [{ translateY: calToastAnim }] }]}>
          <Feather name="calendar" size={18} color={COLORS.primary} style={{ marginRight: 10 }} />
          <Text style={styles.calToastText}>{calToastMsg}</Text>
        </Animated.View>
      )}
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
  chipsWrapper: {
    paddingBottom: 8,
  },
  chipsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chipBtn: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(1, 65, 28, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  chipText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  providerRowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  providerDetails: {
    flex: 1,
  },
  metricLineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricLineText: {
    fontSize: 13,
    color: COLORS.text,
    marginLeft: 6,
    fontWeight: '500',
  },
  socialProofText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontStyle: 'italic',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EAEAEA',
  },
  pinContainer: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    alignItems: 'center',
  },
  pinTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 2,
    letterSpacing: 1,
  },
  pinSubtext: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  actionBtnCall: {
    flex: 1.2,
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnMsg: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F0FFF4',
    borderWidth: 1,
    borderColor: 'rgba(1, 65, 28, 0.15)',
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnCalendar: {
    flex: 1.2,
    flexDirection: 'row',
    backgroundColor: '#F0FFF4',
    borderWidth: 1,
    borderColor: 'rgba(1, 65, 28, 0.15)',
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnTextLight: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  actionBtnTextDark: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  mapContainer: {
    height: 120,
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  coordsContainer: {
    backgroundColor: '#F0FFF4',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(1, 65, 28, 0.15)',
  },
  coordsText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  // ─── Avatar ───
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarImageSm: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholderSm: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    backgroundColor: '#FFF',
    borderRadius: 8,
  },
  // ─── Chip location variant ───
  chipBtnLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: 'rgba(1,65,28,0.25)',
    backgroundColor: '#F0FFF4',
  },
  // ─── Cancel Modal ───
  cancelModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cancelModalBox: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  cancelModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  cancelModalSub: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 18,
    textAlign: 'center',
  },
  cancelChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cancelChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    backgroundColor: '#F9F9F9',
  },
  cancelChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(1,65,28,0.08)',
  },
  cancelChipText: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  cancelChipTextActive: {
    color: COLORS.primary,
  },
  cancelOtherBox: {
    width: '100%',
    marginBottom: 12,
  },
  cancelOtherInput: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: COLORS.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  cancelCharCount: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'right',
    marginTop: 4,
  },
  cancelModalBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    width: '100%',
  },
  cancelModalNevermind: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
  },
  cancelModalNevermindText: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  cancelModalFindNew: {
    flex: 1.1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#F0FFF4',
    borderWidth: 1,
    borderColor: 'rgba(1,65,28,0.2)',
    alignItems: 'center',
  },
  cancelModalFindNewText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '700',
  },
  cancelModalConfirm: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#E11D48',
    alignItems: 'center',
  },
  cancelModalConfirmText: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '700',
  },
  // ─── Location Picker ───
  fixedPin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -40,
    zIndex: 10,
  },
  locationSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  locationSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  locationSheetLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  locationSheetAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationSheetAddress: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '700',
    flex: 1,
  },
  locationCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    alignItems: 'center',
  },
  locationCancelText: {
    fontSize: 14,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  locationConfirmBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationConfirmText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '700',
  },
  // ─── Calendar Toast ───
  calToast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 90,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  calToastText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
});

