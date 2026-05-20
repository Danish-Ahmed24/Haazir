# Haazir (حاضر) - Autonomous Service Application

Haazir is a premium, AI-first service marketplace application designed for the Pakistani market. It allows users to find, book, and manage local service providers (plumbers, electricians, cleaners, AC technicians, etc.) through a fluid, conversational interface powered by Google Gemini and live real-world mapping.

![Haazir App](https://img.shields.io/badge/Status-Beta-brightgreen)
![React Native](https://img.shields.io/badge/React_Native-Expo_54-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)

## 🚀 Core Features

- **Agentic AI Orchestration:** Powered by Google Gemini to analyze user intent, dynamically clarify ambiguous requests, and execute complex booking state machines.
- **High-Fidelity Conversational UI:** A Careem/Uber-style aesthetic featuring custom frosted glass modals, inline vector icons, and buttery-smooth layout animations.
- **Live Google Maps Integration:** Full-screen interactive location picker with a stationary center-pin and debounced live reverse-geocoding.
- **Provider Marketplace:** Rich mock database featuring 30+ highly-detailed profiles complete with verification badges, dynamic ratings, and realistic localized headshots.
- **Offline Resilience:** Actions are intelligently queued via `AsyncStorage` when the network drops and are automatically processed upon reconnection.

## 🛠 Tech Stack

- **Framework:** React Native (Expo SDK 54)
- **Language:** TypeScript
- **State & Animations:** React Hooks, `Animated` API, `LayoutAnimation`
- **Mapping:** `react-native-maps`, Google Maps Geocoding API
- **AI Core:** `@google/genai` (Gemini API)
- **Icons:** `@expo/vector-icons` (Ionicons, Feather, MaterialCommunityIcons)

---

## 🏗 Architecture & System Design

Haazir's architecture is fundamentally built on a **multi-agent pipeline** driven by LLMs, replacing traditional state-heavy navigation flows with a conversational UI.

### The Agentic Pipeline
The system orchestrates a sequence of specialized AI agents built with the Google Gemini API:
1. **IntentAgent:** The entry point. Parses unstructured natural language from the user, determining the required `service_type` (e.g., "Plumbing") and spatial/temporal context. It dynamically asks clarifying questions if the prompt is ambiguous.
2. **DiscoveryAgent:** Acts as the search engine. It maps the parsed intent against the `MOCK_PROVIDERS` database to find relevant matches within a predefined geospatial radius.
3. **RankingAgent:** A decision engine that scores the discovered providers based on a composite metric of `rating`, `completed_jobs`, and physical proximity to the user, ensuring the best provider is presented first.
4. **BookingAgent:** Handles the transaction simulation. It generates a mock receipt, an ETA, and a secure PIN, finalizing the state transition from "Searching" to "Confirmed."

### Data Sources (Mock vs. Real)
- **Real APIs:** 
  - **Google Gemini API (`@google/genai`):** Used live in production to power the agent pipeline, processing real-time NLP.
  - **Google Maps Geocoding API:** Used live to convert interactive map pin coordinates (`lat`/`lng`) into real-world, formatted street addresses via secure HTTP fetches.
  - **RandomUser API:** Hot-linked avatar images are fetched from `randomuser.me` to populate provider profile pictures.
- **Mock APIs:**
  - **Provider Database:** Due to the absence of a real backend, the marketplace of service professionals is mocked in `src/data/mockProviders.ts`. This contains 34 rich profiles across categories like Plumbing, Electrical, Cleaning, AC Repair, Carpentry, and Appliance Care.
  - **Booking Execution:** Simulates the actual dispatch and payment confirmation process, relying on React local state to manage the lifecycle of a booking.

### Core UI Integrations
- **Conversational State Machine:** All interactions, from text queries to location selections, are injected into a unified `messages` array, acting as the single source of truth for the UI.
- **Geospatial Mapping:** Integrates `react-native-maps` for a full-screen, Careem-style precise location picker. It utilizes a debounced `onRegionChangeComplete` listener to fetch real addresses without spamming the Geocoding API.
- **Native Interactivity:** Uses React Native's `Linking` module to allow users to inject confirmed bookings directly into their device's native Calendar application.

---

## ⚙️ Prerequisites

Before you begin, ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) or [Yarn](https://yarnpkg.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Expo Go app installed on your iOS or Android device (for physical testing).

---

## 🔐 Environment Variables (.env)

The application relies on external APIs for AI processing and geospatial mapping. You must create a `.env` file in the root directory of the project.

Create a file named `.env` in the `react-native-service` folder and populate it with your keys:

```env
# Google Gemini API Key for Intent and Booking Agents
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here

# Google Maps API Key (Ensure Geocoding API is enabled in Google Cloud Console)
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

> **Warning:** Never commit your `.env` file to version control. It is already added to `.gitignore`.

---

## 📦 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd react-native-service
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Start the Expo development server:**
   ```bash
   npx expo start
   ```

4. **Run the App:**
   - **Physical Device:** Scan the QR code shown in the terminal using the Expo Go app.
   - **iOS Simulator:** Press `i` in the terminal.
   - **Android Emulator:** Press `a` in the terminal.

---

## 🗂 Project Structure

```text
react-native-service/
├── App.tsx                     # Main application entry point & orchestration
├── .env                        # Secret keys (do not commit)
├── .gitignore                  # Git ignore rules
├── app.json                    # Expo configuration
├── package.json                # Project dependencies
├── tsconfig.json               # TypeScript strict configuration
└── src/
    ├── agents/                 # Core AI Logic
    │   ├── IntentAgent.ts      # Parses user text & manages conversational state
    │   ├── DiscoveryAgent.ts   # Matches intent to local service providers
    │   ├── RankingAgent.ts     # Ranks providers by distance & rating
    │   └── BookingAgent.ts     # Orchestrates mock scheduling and receipts
    ├── data/
    │   └── mockProviders.ts    # Rich dataset of local service providers
    └── types/
        └── AgentTypes.ts       # Global TypeScript interfaces & enums
```

---

## 📄 Logs & Traces

The project includes a `logs/` directory that stores complete conversational traces and execution summaries generated during the AI-driven development and orchestration phases. 
- `logs/overview.txt`: Contains full chronological documentation of agent steps, commands executed, and system logic paths taken during application development.

---

## 🎨 UI/UX Highlights

- **Custom Cancel Flow:** A smart state machine that prevents accidental cancellations by requiring the user to select a reason before confirming.
- **Calendar Integration:** Seamlessly opens the device's native calendar to schedule upcoming service appointments, accompanied by a premium slide-down success toast overlay.
- **Provider Portal:** A built-in mock interface allowing simulated service providers to accept jobs, navigate to the user, and mark jobs as completed.

## 🤝 Contributing

Contributions are welcome! If you find any bugs or have feature requests, please open an issue or submit a pull request.

## 📄 License

This project is licensed under the MIT License.
