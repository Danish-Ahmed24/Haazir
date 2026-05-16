import { StatusBar } from 'expo-status-bar';
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeIntent } from './src/agents/IntentAgent';
import { discoverProviders } from './src/agents/DiscoveryAgent';
import { rankProviders, RankedProvider } from './src/agents/RankingAgent';
import { simulateBooking, BookingReceipt } from './src/agents/BookingAgent';
import { scheduleFollowUp } from './src/agents/FollowUpAgent';

const { width, height } = Dimensions.get('window');

const COLORS = {
  primary: '#2A9D8F', // Soft Crescent Green
  secondary: '#E9C46A', // Warm Sand
  background: '#F4F7F6', // Canvas
  surface: '#FFFFFF',
  text: '#264653',
  textLight: '#8D99AE',
  terminalBg: '#1E1E1E',
  terminalText: '#4ADE80',
};

const CATEGORIES = ['All', 'Cleaning', 'IT Solutions', 'Plumbing', 'Electrical'];

export default function App() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeBooking, setActiveBooking] = useState<BookingReceipt | null>(null);
  const [rankedProviders, setRankedProviders] = useState<RankedProvider[]>([]);
  const [isXRayVisible, setIsXRayVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(height)).current; // Start hidden off-screen
  
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        AsyncStorage.getItem('@offline_request_queue').then(queuedQuery => {
          if (queuedQuery) {
            AsyncStorage.removeItem('@offline_request_queue');
            handleSearch(queuedQuery);
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const handleComingSoon = () => Alert.alert("Coming Soon", "This feature is disabled for the prototype demo.");

  const handleSearch = async (queryToSearch = searchQuery) => {
    if (typeof queryToSearch !== 'string' || !queryToSearch.trim()) return;

    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      await AsyncStorage.setItem('@offline_request_queue', queryToSearch);
      Alert.alert("Offline", "You are offline. Request queued!");
      return;
    }

    setIsSearching(true);
    try {
      const intent = await analyzeIntent(queryToSearch);
      if (intent.is_complete && intent.service_type) {
        // Discovery Agent Phase
        const discoveryResult = await discoverProviders(intent.service_type);
        const discovered = discoveryResult.providers;

        if (discoveryResult.expanded_search) {
          Alert.alert("Expanded Search", "No providers found in your immediate vicinity. We expanded our search to find your match.");
        }
        
        // Ranking Agent Phase
        const ranked = await rankProviders(discovered);

        if (ranked.length > 0) {
          setRankedProviders(ranked);
          const topProvider = ranked[0];
          
          // Simulate Transaction
          const receipt = await simulateBooking(topProvider);
          
          // Follow-up Agent Phase
          await scheduleFollowUp(receipt);
          
          setActiveBooking(receipt);
          setSearchQuery(''); // Clear the search bar
        } else {
          Alert.alert('No Providers Found', `We couldn't find any ${intent.service_type} providers near your location.`);
        }
      } else {
        Alert.alert('More Info Needed', intent.clarification_question || 'Please provide more details about the service you need.');
      }
    } catch (error) {
      Alert.alert('Pipeline Error', 'An error occurred while processing your request.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSimulateCancel = async () => {
    if (!activeBooking) return;
    
    Alert.alert("Cancellation", `${activeBooking.provider_name} canceled. Haazir is autonomously finding a replacement...`);
    setActiveBooking(null);

    if (rankedProviders.length > 1) {
      const nextProvider = rankedProviders[1];
      const receipt = await simulateBooking(nextProvider);
      await scheduleFollowUp(receipt);
      setActiveBooking(receipt);
    } else {
      Alert.alert("Rebooking Failed", "No other providers available right now.");
    }
  };
  
  const toggleXRay = () => {
    const toValue = isXRayVisible ? height : height * 0.5;
    Animated.spring(slideAnim, {
      toValue,
      useNativeDriver: true,
      bounciness: 0,
      speed: 12,
    }).start();
    setIsXRayVisible(!isXRayVisible);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.profileSection}>
            <Image
              source={{ uri: 'https://i.pravatar.cc/150?img=47' }}
              style={styles.profilePic}
            />
            <View>
              <Text style={styles.welcomeText}>Welcome</Text>
              <Text style={styles.userName}>Anna Grace</Text>
            </View>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconButton} onPress={handleComingSoon}>
              <Ionicons name="location-outline" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={handleComingSoon}>
              <Ionicons name="cart-outline" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* TITLE */}
        <View style={styles.titleContainer}>
          <Text style={styles.mainTitle}>Smart Home,</Text>
          <Text style={styles.italicTitle}>Smooth Services</Text>
        </View>

        {/* ACTIVE BOOKING CARD */}
        {activeBooking && (
          <View style={styles.activeBookingCard}>
            <View style={styles.bookingHeader}>
              <View style={styles.pulseIndicator} />
              <Text style={styles.bookingStatus}>{activeBooking.status}</Text>
            </View>
            <Text style={styles.bookingProvider}>{activeBooking.provider_name}</Text>
            <Text style={styles.bookingService}>{activeBooking.service_type}</Text>
            
            <View style={styles.bookingFooter}>
              <View style={styles.etaContainer}>
                <Feather name="clock" size={14} color={COLORS.primary} />
                <Text style={styles.etaText}>ETA: {activeBooking.eta_minutes} mins</Text>
              </View>
              <Text style={styles.bookingId}>ID: {activeBooking.booking_id}</Text>
            </View>

            <TouchableOpacity style={styles.cancelBtn} onPress={handleSimulateCancel}>
              <Text style={styles.cancelBtnText}>Simulate Provider Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* SEARCH BAR */}
        <View style={styles.searchContainer}>
          <Feather name="search" size={20} color={COLORS.textLight} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={COLORS.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => handleSearch()}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.micButton} onPress={() => handleSearch()} disabled={isSearching}>
            {isSearching ? (
              <ActivityIndicator size="small" color={COLORS.surface} />
            ) : searchQuery.length > 0 ? (
              <Ionicons name="send" size={20} color={COLORS.surface} />
            ) : (
              <Ionicons name="mic" size={20} color={COLORS.surface} />
            )}
          </TouchableOpacity>
        </View>

        {/* CATEGORIES */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.categoriesContainer}
          contentContainerStyle={{ paddingHorizontal: 24 }}
        >
          {CATEGORIES.map((cat, index) => (
            <TouchableOpacity 
              key={index}
              style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
              onPress={() => {
                setActiveCategory(cat);
                if (cat !== 'All') handleComingSoon();
              }}
            >
              <Text style={[styles.categoryText, activeCategory === cat && styles.categoryTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* MAIN PROMO BANNER */}
        <View style={styles.bannerContainer}>
          <LinearGradient
            colors={['#E0F2F1', '#B2DFDB']}
            style={styles.bannerBackground}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.bannerTags}>
              <View style={styles.tag}>
                <Feather name="clock" size={12} color={COLORS.text} />
                <Text style={styles.tagText}>24/7 Support</Text>
              </View>
              <View style={[styles.tag, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
                <Text style={[styles.tagText, { fontWeight: '700' }]}>40% <Text style={{fontWeight: '400'}}>Off</Text></Text>
              </View>
            </View>

            <View style={styles.bannerContent}>
              <View style={{flex: 1}}>
                <Text style={styles.bannerSub}>Fresh, Fast Cleaning</Text>
                <Text style={styles.bannerTitle}>Quick Home{'\n'}Cleaning Service</Text>
              </View>
            </View>

            <Image 
              source={{uri: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=500&auto=format&fit=crop'}} 
              style={styles.bannerImage} 
            />

            <TouchableOpacity style={styles.bookNowBtn} onPress={handleComingSoon}>
              <Ionicons name="cart-outline" size={16} color={COLORS.surface} style={{marginRight: 6}} />
              <Text style={styles.bookNowText}>Book Now</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>

        {/* QUICK ACTIONS / X-RAY TOGGLE (MOCK) */}
        <TouchableOpacity style={styles.xrayToggleBtn} onPress={toggleXRay}>
          <MaterialCommunityIcons name="robot-outline" size={20} color={COLORS.primary} />
          <Text style={styles.xrayToggleText}>View Pipeline Activity (X-Ray)</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* BOTTOM NAVIGATION */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItemActive}>
          <Ionicons name="home" size={22} color={COLORS.surface} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleComingSoon}>
          <Feather name="calendar" size={22} color={COLORS.textLight} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleComingSoon}>
          <Feather name="users" size={22} color={COLORS.textLight} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleComingSoon}>
          <Feather name="user" size={22} color={COLORS.textLight} />
        </TouchableOpacity>
      </View>

      {/* X-RAY TERMINAL DRAWER */}
      <Animated.View style={[styles.xrayTerminal, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.xrayHeader}>
          <Text style={styles.xrayTitle}>Terminal: Antigravity Agent Pipeline</Text>
          <TouchableOpacity onPress={toggleXRay}>
            <Ionicons name="close" size={24} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.terminalContent}>
          <Text style={styles.terminalLine}>{">"} [INTENT_AGENT] Analyzing voice input...</Text>
          <Text style={styles.terminalLine}>{">"} [INTENT_AGENT] Extracted: {"{ service: 'Cleaning', intent: 'Book' }"}</Text>
          <Text style={styles.terminalLine}>{">"} [DISCOVERY_AGENT] Searching radius: 5km</Text>
          <Text style={styles.terminalLine}>{">"} [DISCOVERY_AGENT] Found 3 providers in 400ms.</Text>
          <Text style={styles.terminalLine}>{">"} [RANKING_AGENT] Triage scoring applied.</Text>
          <Text style={styles.terminalLine}>{">"} [SYSTEM] Awaiting user confirmation...</Text>
        </ScrollView>
      </Animated.View>

    </SafeAreaView>
  </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    marginBottom: 24,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 6,
    paddingRight: 16,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profilePic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  welcomeText: {
    fontSize: 10,
    color: COLORS.textLight,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  headerActions: {
    flexDirection: 'row',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  titleContainer: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  italicTitle: {
    fontSize: 32,
    fontWeight: '500',
    fontStyle: 'italic',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 24,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  activeBookingCard: {
    marginHorizontal: 24,
    marginBottom: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(42, 157, 143, 0.2)',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  bookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pulseIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginRight: 6,
  },
  bookingStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  bookingProvider: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  bookingService: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 16,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
  },
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(42, 157, 143, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  etaText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    marginLeft: 4,
  },
  bookingId: {
    fontSize: 10,
    color: '#CCCCCC',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cancelBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#CCCCCC',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  cancelBtnText: {
    color: '#FF4D4F',
    fontSize: 12,
    fontWeight: '600',
  },
  micButton: {
    backgroundColor: COLORS.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoriesContainer: {
    marginBottom: 24,
  },
  categoryChip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  categoryChipActive: {
    backgroundColor: '#333333',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textLight,
  },
  categoryTextActive: {
    color: COLORS.surface,
  },
  bannerContainer: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  bannerBackground: {
    borderRadius: 24,
    padding: 24,
    height: 280,
    overflow: 'hidden',
  },
  bannerTags: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    zIndex: 10,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    color: COLORS.text,
    marginLeft: 6,
    fontWeight: '500',
  },
  bannerContent: {
    zIndex: 10,
    flex: 1,
  },
  bannerSub: {
    fontSize: 12,
    color: COLORS.text,
    opacity: 0.8,
    marginBottom: 6,
  },
  bannerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 30,
  },
  bannerImage: {
    position: 'absolute',
    right: -30,
    bottom: 0,
    width: '80%',
    height: '110%',
    resizeMode: 'contain',
    zIndex: 1,
  },
  bookNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    zIndex: 10,
    position: 'absolute',
    bottom: 24,
    left: 24,
  },
  bookNowText: {
    color: COLORS.surface,
    fontWeight: '600',
    fontSize: 14,
  },
  xrayToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: 'rgba(42, 157, 143, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(42, 157, 143, 0.3)',
    borderStyle: 'dashed',
  },
  xrayToggleText: {
    marginLeft: 8,
    color: COLORS.primary,
    fontWeight: '600',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 30,
    left: '15%',
    right: '15%',
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  navItem: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navItemActive: {
    width: 44,
    height: 44,
    backgroundColor: '#7A65FF', // Purple from the UI
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
  },
  xrayTerminal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.5,
    backgroundColor: COLORS.terminalBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 24,
  },
  xrayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  xrayTitle: {
    color: '#888',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
  },
  terminalContent: {
    flex: 1,
  },
  terminalLine: {
    color: COLORS.terminalText,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 18,
  },
});
