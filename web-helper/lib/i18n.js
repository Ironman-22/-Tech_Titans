// FormMitra — Lightweight UI Internationalization (en / hi / kn, safe DOM text updates only)

import { saveSettingsPatch } from './storage.js';

const DICT = [
  ['providerAuto', 'Auto', 'ऑटो', 'ಸ್ವಯಂ'],
  ['ariaProvider', 'AI provider', 'AI प्रदाता', 'AI ಪೂರೈಕೆದಾರ'],
  ['ariaLanguage', 'Language', 'भाषा', 'ಭಾಷೆ'],
  ['helperBtn', 'Helper', 'सहायक', 'ಸಹಾಯಕ'],
  ['helperModeTitle', 'Helper Mode', 'सहायक मोड', 'ಸಹಾಯಕ ಮೋಡ್'],
  ['helperTitle', 'Toggle Helper Mode', 'Helper Mode चालू या बंद करें', 'Helper Mode ಬದಲಿಸಿ'],
  ['refreshAria', 'Refresh page snapshot', 'पेज दोबारा पढ़ें', 'ಪುಟವನ್ನು ಮರುಲೋಡ್ ಮಾಡಿ'],
  ['refreshTitle', 'Refresh page', 'पेज रिफ्रेश करें', 'ಪುಟ ರಿಫ್ರೆಶ್ ಮಾಡಿ'],
  ['settingsAria', 'Open Settings', 'Settings खोलें', 'Settings ತೆರೆಯಿರಿ'],
  ['settingsTitle', 'Settings', 'Settings', 'Settings'],
  ['ariaTabs', 'Side panel sections', 'साइड पैनल अनुभाग', 'ಸೈಡ್ ಪ್ಯಾನೆಲ್ ವಿಭಾಗಗಳು'],
  ['tabChat', 'Chat', 'चैट', 'ಚಾಟ್'],
  ['tabDetails', 'Details', 'विवरण', 'ವಿವರಗಳು'],
  ['readingPage', 'Reading page...', 'पेज पढ़ा जा रहा है...', 'ಪುಟವನ್ನು ಓದಲಾಗುತ್ತಿದೆ...'],
  ['untitledPage', 'Untitled page', 'बिना शीर्षक वाला पेज', 'ಶೀರ್ಷಿಕೆ ಇಲ್ಲದ ಪುಟ'],
  ['cantReadPage', "I can't read this browser page", 'मैं यह ब्राउज़र पेज नहीं पढ़ सकता', 'ನನಗೆ ಈ ಬ್ರೌಸರ್ ಪುಟವನ್ನು ಓದಲು ಸಾಧ್ಯವಿಲ್ಲ'],
  ['pageNotReadable', 'Page not readable', 'पेज पढ़ा नहीं जा सकता', 'ಪುಟವನ್ನು ಓದಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ'],
  ['readChars', 'Read {n} chars', '{n} अक्षर पढ़े', '{n} ಅಕ್ಷರ ಓದಲಾಗಿದೆ'],
  ['translatePageBtn', 'Translate page', 'पेज अनुवाद करें', 'ಪುಟ ಅನುವಾದಿಸಿ'],
  ['showOriginalBtn', 'Show original', 'मूल दिखाएं', 'ಮೂಲ ತೋರಿಸಿ'],
  ['cancelBtn', 'Cancel', 'रद्द करें', 'ರದ್ದುಮಾಡಿ'],
  ['translatingCollect', 'Collecting visible text...', 'पेज का टेक्स्ट लिया जा रहा है...', 'ಕಾಣುವ ಪಠ್ಯವನ್ನು ಸಂಗ್ರಹಿಸಲಾಗುತ್ತಿದೆ...'],
  ['translatingMore', 'Translating new content...', 'नया हिस्सा अनुवाद हो रहा है...', 'ಹೊಸ ಭಾಗವನ್ನು ಅನುವಾದಿಸಲಾಗುತ್ತಿದೆ...'],
  ['translatingBatch', 'Translating batch {n}...', 'बैच {n} का अनुवाद हो रहा है...', 'ಬ್ಯಾಚ್ {n} ಅನುವಾದಿಸಲಾಗುತ್ತಿದೆ...'],
  ['translationCancelled', 'Translation cancelled.', 'अनुवाद रद्द किया गया।', 'ಅನುವಾದ ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.'],
  ['translationFailed', 'Translation failed.', 'अनुवाद विफल रहा।', 'ಅನುವಾದ ವಿಫಲವಾಗಿದೆ.'],
  ['translatedCount', 'Translated ({n})', 'अनुवादित ({n})', 'ಅನುವಾದಿಸಲಾಗಿದೆ ({n})'],
  ['translatedSkipped', 'Translated ({n}) — some items skipped', 'अनुवादित ({n}) — कुछ हिस्से छोड़े गए', 'ಅನುವಾದಿಸಲಾಗಿದೆ ({n}) — ಕೆಲವು ಭಾಗ ಬಿಡಲಾಗಿದೆ'],
  ['translatedScrollMore', 'Translated ({n}) — scroll for more', 'अनुवादित ({n}) — आगे स्क्रॉल करें', 'ಅನುವಾದಿಸಲಾಗಿದೆ ({n}) — ಮುಂದೆ ಸ್ಕ್ರಾಲ್ ಮಾಡಿ'],
  ['firstRunNotice', 'Page text and your questions are sent to the AI provider you choose.', 'पेज का टेक्स्ट और आपके सवाल आपके चुने AI प्रदाता को भेजे जाते हैं।', 'ಪುಟದ ಪಠ್ಯ ಮತ್ತು ನಿಮ್ಮ ಪ್ರಶ್ನೆಗಳನ್ನು ನೀವು ಆರಿಸಿದ AI ಪೂರೈಕೆದಾರರಿಗೆ ಕಳುಹಿಸಲಾಗುತ್ತದೆ.'],
  ['dismissBtn', 'Dismiss', 'ठीक है', 'ಮುಚ್ಚಿ'],
  ['noKeyPrompt', 'Add an API key in Settings', 'Settings में API key जोड़ें', 'Settings ನಲ್ಲಿ API key ಸೇರಿಸಿ'],
  ['noKeyErrSummary', 'Add an API key in Settings.', 'Settings में API key जोड़ें।', 'Settings ನಲ್ಲಿ API key ಸೇರಿಸಿ.'],
  ['noKeyErrDetail', 'Neither Gemini nor Groq API key is configured.', 'Gemini या Groq की कोई API key सेट नहीं है।', 'Gemini ಅಥವಾ Groq API key ಹೊಂದಿಸಲಾಗಿಲ್ಲ.'],
  ['openSettingsBtn', 'Open Settings', 'Settings खोलें', 'Settings ತೆರೆಯಿರಿ'],
  ['emptyPrompt', 'Ask a question, find text, search, or fill forms.', 'सवाल पूछें, टेक्स्ट खोजें, साइट पर ढूंढें या फॉर्म भरें।', 'ಪ್ರಶ್ನೆ ಕೇಳಿ, ಪಠ್ಯ ಹುಡುಕಿ, ಸೈಟ್‌ನಲ್ಲಿ ಹುಡುಕಿ ಅಥವಾ ಫಾರ್ಮ್ ತುಂಬಿ.'],
  ['chipWhat', 'What is this page?', 'यह पेज क्या है?', 'ಈ ಪುಟ ಯಾವುದು?'],
  ['chipFind', 'Find something', 'कुछ ढूंढें', 'ಏನನ್ನಾದರೂ ಹುಡುಕಿ'],
  ['chipSearch', 'Search this site', 'इस साइट पर खोजें', 'ಈ ಸೈಟ್‌ನಲ್ಲಿ ಹುಡುಕಿ'],
  ['chipOpenUrl', 'Open a website', 'वेबसाइट खोलें', 'ವೆಬ್‌ಸೈಟ್ ತೆರೆಯಿರಿ'],
  ['chipFill', 'Fill this form', 'यह फॉर्म भरें', 'ಈ ಫಾರ್ಮ್ ತುಂಬಿ'],
  ['autoAllowNav', 'Auto-allow navigation clicks', 'नेविगेशन क्लिक अपने आप अनुमति दें', 'ನ್ಯಾವಿಗೇಷನ್ ಕ್ಲಿಕ್‌ಗಳಿಗೆ ಸ್ವಯಂ ಅನುಮತಿ ನೀಡಿ'],
  ['inputPlaceholder', 'Ask about this page, find text, search, or fill...', 'इस पेज के बारे में पूछें, ढूंढें या भरें...', 'ಈ ಪುಟದ ಬಗ್ಗೆ ಕೇಳಿ, ಹುಡುಕಿ ಅಥವಾ ತುಂಬಿ...'],
  ['inputAria', 'Ask a question or give a command', 'सवाल पूछें या निर्देश दें', 'ಪ್ರಶ್ನೆ ಕೇಳಿ ಅಥವಾ ಆದೇಶ ನೀಡಿ'],
  ['voiceInputAria', 'Voice input', 'आवाज़ से लिखें', 'ಧ್ವನಿ ಇನ್‌ಪುಟ್'],
  ['voiceInputTitle', 'Voice input', 'आवाज़ से लिखें', 'ಧ್ವನಿ ಇನ್‌ಪುಟ್'],
  ['stopBtn', 'Stop', 'रोकें', 'ನಿಲ್ಲಿಸಿ'],
  ['stopAria', 'Stop agent', 'एजेंट रोकें', 'ಏಜೆಂಟ್ ನಿಲ್ಲಿಸಿ'],
  ['stopTitle', 'Stop (Esc)', 'रोकें (Esc)', 'ನಿಲ್ಲಿಸಿ (Esc)'],
  ['sendAria', 'Send message', 'संदेश भेजें', 'ಸಂದೇಶ ಕಳುಹಿಸಿ'],
  ['sendTitle', 'Send', 'भेजें', 'ಕಳುಹಿಸಿ'],
  ['viaProvider', 'via {provider}', '{provider} से', '{provider} ಮೂಲಕ'],
  ['findZero', '0 matches', '0 परिणाम मिले', '0 ಫಲಿತಾಂಶಗಳು'],
  ['findOneMatch', '1 match ({idx} of 1 for "{query}")', '1 परिणाम ("{query}" के लिए 1 में से {idx})', '1 ಹೊಂದಾಣಿಕೆ ("{query}" ಗಾಗಿ 1 ರಲ್ಲಿ {idx})'],
  ['findManyMatches', '{c} matches ({idx} of {c} for "{query}")', '{c} परिणाम ("{query}" के लिए {c} में से {idx})', '{c} ಹೊಂದಾಣಿಕೆಗಳು ("{query}" ಗಾಗಿ {c} ರಲ್ಲಿ {idx})'],
  ['findCleared', 'Highlights cleared.', 'हाइलाइट हटाए गए।', 'ಹೈಲೈಟ್‌ಗಳನ್ನು ತೆರವುಗೊಳಿಸಲಾಗಿದೆ.'],
  ['prevBtn', 'Prev', 'पिछला', 'ಹಿಂದಿನ'],
  ['nextBtn', 'Next', 'अगला', 'ಮುಂದಿನ'],
  ['clearBtn', 'Clear', 'साफ़ करें', 'ತೆರವು'],
  ['detailsLabel', 'Details', 'विवरण', 'ವಿವರಗಳು'],
  ['retryBtn', 'Retry', 'फिर कोशिश करें', 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ'],
  ['allowBtn', 'Allow', 'अनुमति दें', 'ಅನುಮತಿಸಿ'],
  ['skipBtn', 'Skip', 'छोड़ें', 'ಬಿಡಿ'],
  ['statusAllowed', 'Allowed', 'अनुमति दी गई', 'ಅನುಮತಿಸಲಾಗಿದೆ'],
  ['statusSkipped', 'Skipped', 'छोड़ा गया', 'ಬಿಡಲಾಗಿದೆ'],
  ['statusStopped', 'Stopped', 'रोका गया', 'ನಿಲ್ಲಿಸಲಾಗಿದೆ'],
  ['approveClick', 'I want to click: "{text}" because {reason}', 'मैं "{text}" पर क्लिक करना चाहता हूँ ({reason})', 'ನಾನು "{text}" ಮೇಲೆ ಕ್ಲಿಕ್ ಮಾಡಲು ಬಯಸುತ್ತೇನೆ ({reason})'],
  ['approveTypeSearch', 'I want to type: "{text}" into the search box because {reason}', 'मैं खोज बॉक्स में "{text}" लिखना चाहता हूँ ({reason})', 'ನಾನು ಹುಡುಕಾಟ ಬಾಕ್ಸ್‌ನಲ್ಲಿ "{text}" ಟೈಪ್ ಮಾಡಲು ಬಯಸುತ್ತೇನೆ ({reason})'],
  ['approveTypeComposer', 'I want to type a draft: "{text}" into the message box because {reason}', 'मैं संदेश बॉक्स में "{text}" ड्राफ्ट लिखना चाहता हूँ ({reason})', 'ನಾನು ಸಂದೇಶ ಬಾಕ್ಸ್‌ನಲ್ಲಿ "{text}" ಡ್ರಾಫ್ಟ್ ಟೈಪ್ ಮಾಡಲು ಬಯಸುತ್ತೇನೆ ({reason})'],
  ['approveScroll', 'I want to scroll {dir} because {reason}', 'मैं पेज {dir} स्क्रॉल करना चाहता हूँ ({reason})', 'ನಾನು ಪುಟವನ್ನು {dir} ಸ್ಕ್ರಾಲ್ ಮಾಡಲು ಬಯಸುತ್ತೇನೆ ({reason})'],
  ['approveFind', 'I want to find "{text}" on the page because {reason}', 'मैं पेज पर "{text}" खोजना चाहता हूँ ({reason})', 'ನಾನು ಪುಟದಲ್ಲಿ "{text}" ಹುಡುಕಲು ಬಯಸುತ್ತೇನೆ ({reason})'],
  ['approveOpenSearch', 'I want to open: Google search for: {query}', 'मैं खोलना चाहता हूँ: Google खोज: {query}', 'ನಾನು ತೆರೆಯಲು ಬಯಸುತ್ತೇನೆ: Google ಹುಡುಕಾಟ: {query}'],
  ['approveOpenUrl', 'I want to open: {url}', 'मैं खोलना चाहता हूँ: {url}', 'ನಾನು ತೆರೆಯಲು ಬಯಸುತ್ತೇನೆ: {url}'],
  ['approveFillField', 'I want to fill "{field}" with your saved "{label}"', 'मैं "{field}" में आपका सहेजा "{label}" भरना चाहता हूँ', 'ನಾನು "{field}" ನಲ್ಲಿ ನಿಮ್ಮ ಉಳಿಸಿದ "{label}" ತುಂಬಲು ಬಯಸುತ್ತೇನೆ'],
  ['approveGeneric', 'I want to run {type} because {reason}', 'मैं {type} चलाना चाहता हूँ ({reason})', 'ನಾನು {type} ನಡೆಸಲು ಬಯಸುತ್ತೇನೆ ({reason})'],
  ['thinking', 'Thinking...', 'सोच रहा है...', 'ಯೋಚಿಸಲಾಗುತ್ತಿದೆ...'],
  ['waitingNextStep', 'Waiting before next step...', 'अगले कदम से पहले रुक रहा है...', 'ಮುಂದಿನ ಹಂತಕ್ಕೆ ಕಾಯಲಾಗುತ್ತಿದೆ...'],
  ['checkingPage', 'Checking page...', 'पेज जाँचा जा रहा है...', 'ಪುಟವನ್ನು ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...'],
  ['stepClicked', 'Clicked: {text} ({status})', 'क्लिक किया: {text} ({status})', 'ಕ್ಲಿಕ್ ಮಾಡಲಾಗಿದೆ: {text} ({status})'],
  ['stepTyped', 'Typed "{text}" into {target} ({status})', '{target} में "{text}" लिखा ({status})', '{target} ನಲ್ಲಿ "{text}" ಟೈಪ್ ಮಾಡಲಾಗಿದೆ ({status})'],
  ['stepScrolled', 'Scrolled {dir} ({status})', '{dir} स्क्रॉल किया ({status})', '{dir} ಸ್ಕ್ರಾಲ್ ಮಾಡಲಾಗಿದೆ ({status})'],
  ['stepOpened', 'Opened: {target} ({status})', 'खोला: {target} ({status})', 'ತೆರೆಯಲಾಗಿದೆ: {target} ({status})'],
  ['stateChanged', 'page changed', 'पेज बदला', 'ಪುಟ ಬದಲಾಗಿದೆ'],
  ['stateNoChange', 'no visible change', 'कोई बदलाव नहीं दिखा', 'ಯಾವುದೇ ಬದಲಾವಣೆ ಕಾಣಲಿಲ್ಲ'],
  ['stoppedMsg', 'Stopped.', 'रोका गया।', 'ನಿಲ್ಲಿಸಲಾಗಿದೆ.'],
  ['maxStepsMsg', 'Reached maximum step limit.', 'अधिकतम कदम पूरे हो गए।', 'ಗರಿಷ್ಠ ಹಂತಗಳ ಮಿತಿ ತಲುಪಿದೆ.'],
  ['draftTypedMsg', 'Draft typed. Review it and press Send yourself.', 'ड्राफ्ट लिख दिया है। जाँचें और खुद Send दबाएं।', 'ಡ್ರಾಫ್ಟ್ ಟೈಪ್ ಆಗಿದೆ. ಪರಿಶೀಲಿಸಿ ನೀವೇ Send ಒತ್ತಿ.'],
  ['blockedSafetyMsg', 'Action blocked by safety guard.', 'सुरक्षा नियम ने यह काम रोक दिया।', 'ಸುರಕ್ಷತಾ ನಿಯಮದಿಂದ ಈ ಕ್ರಿಯೆ ತಡೆಯಲಾಗಿದೆ.'],
  ['blockedUrlScheme', 'Blocked unsafe URL scheme. Only http:// and https:// URLs are allowed.', 'असुरक्षित लिंक रोका गया। केवल http:// और https:// की अनुमति है।', 'ಅಸುರಕ್ಷಿತ ಲಿಂಕ್ ತಡೆಯಲಾಗಿದೆ. http:// ಮತ್ತು https:// ಮಾತ್ರ ಅನುಮತಿಸಲಾಗಿದೆ.'],
  ['stuckMsg', "I couldn't make that work on this page. Try clicking it yourself, or ask me something else.", 'इस पेज पर यह काम नहीं कर पाया। खुद क्लिक करें या कुछ और पूछें।', 'ಈ ಪುಟದಲ್ಲಿ ಅದು ಕೆಲಸ ಮಾಡಲಿಲ್ಲ. ನೀವೇ ಕ್ಲಿಕ್ ಮಾಡಿ ಅಥವಾ ಬೇರೆ ಏನಾದರೂ ಕೇಳಿ.'],
  ['svcUnreachable', 'Could not reach extension service.', 'एक्सटेंशन सेवा से संपर्क नहीं हो पाया।', 'ಎಕ್ಸ್‌ಟೆನ್ಶನ್ ಸೇವೆಯನ್ನು ತಲುಪಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'],
  ['emptyResponse', 'No response received.', 'कोई उत्तर नहीं मिला।', 'ಯಾವುದೇ ಉತ್ತರ ಬರಲಿಲ್ಲ.'],
  ['errAiResp', 'Could not get a response from the AI provider.', 'AI प्रदाता से उत्तर नहीं मिल पाया।', 'AI ಪೂರೈಕೆದಾರರಿಂದ ಉತ್ತರ ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'],
  ['errCouldNotSearch', 'Could not search this page.', 'इस पेज पर खोज नहीं हो सकी।', 'ಈ ಪುಟದಲ್ಲಿ ಹುಡುಕಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'],
  ['errCouldNotOpen', 'Could not open page.', 'पेज खोला नहीं जा सका।', 'ಪುಟವನ್ನು ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'],
  ['unreadableCardMsg', "I can't read this browser page. I can open a website for you instead.", 'मैं यह ब्राउज़र पेज नहीं पढ़ सकता। मैं आपके लिए कोई वेबसाइट खोल सकता हूँ।', 'ನನಗೆ ಈ ಬ್ರೌಸರ್ ಪುಟವನ್ನು ಓದಲು ಸಾಧ್ಯವಿಲ್ಲ. ಬದಲಿಗೆ ನಾನು ವೆಬ್‌ಸೈಟ್ ತೆರೆಯಬಲ್ಲೆ.'],
  ['openGoogleBtn', 'Open Google', 'Google खोलें', 'Google ತೆರೆಯಿರಿ'],
  ['goWebsitePh', 'Go to a website or search', 'वेबसाइट लिखें या खोजें', 'ವೆಬ್‌ಸೈಟ್ ಅಥವಾ ಹುಡುಕಾಟ ನಮೂದಿಸಿ'],
  ['goBtn', 'Go', 'खोलें', 'ತೆರೆಯಿರಿ'],
  ['openingStatus', 'Opening...', 'खोल रहा है...', 'ತೆರೆಯಲಾಗುತ್ತಿದೆ...'],
  ['openedStatus', 'Opened.', 'खुल गया।', 'ತೆರೆಯಲಾಗಿದೆ.'],
  ['openFailed', 'Could not open website.', 'वेबसाइट खोली नहीं जा सकी।', 'ವೆಬ್‌ಸೈಟ್ ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'],
  ['onlyHttpAllowed', 'Only http:// and https:// URLs are allowed.', 'केवल http:// और https:// लिंक मान्य हैं।', 'ಕೇವಲ http:// ಮತ್ತು https:// ಲಿಂಕ್‌ಗಳಿಗೆ ಮಾತ್ರ ಅನುಮತಿ ಇದೆ.'],
  ['noFormFields', 'No visible form fields were found on this page.', 'इस पेज पर कोई दिखने वाला फॉर्म फ़ील्ड नहीं मिला।', 'ಈ ಪುಟದಲ್ಲಿ ಯಾವುದೇ ಕಾಣುವ ಫಾರ್ಮ್ ಫೀಲ್ಡ್ ಕಂಡುಬಂದಿಲ್ಲ.'],
  ['needDetailsFirst', 'Add non-sensitive details in the Details tab first, or use Insert for sensitive items.', 'पहले Details टैब में सामान्य विवरण जोड़ें, या संवेदनशील जानकारी के लिए Insert चुनें।', 'ಮೊದಲು Details ಟ್ಯಾಬ್‌ನಲ್ಲಿ ಸಾಮಾನ್ಯ ವಿವರಗಳನ್ನು ಸೇರಿಸಿ, ಅಥವಾ ಸೂಕ್ಷ್ಮ ಮಾಹಿತಿಗೆ Insert ಬಳಸಿ.'],
  ['matchingFields', 'Matching form fields...', 'फॉर्म फ़ील्ड मिलाए जा रहे हैं...', 'ಫಾರ್ಮ್ ಫೀಲ್ಡ್‌ಗಳನ್ನು ಹೊಂದಿಸಲಾಗುತ್ತಿದೆ...'],
  ['noFieldsMatched', 'None of your saved details matched the fields on this form.', 'आपका कोई भी सहेजा विवरण इस फॉर्म से मेल नहीं खाया।', 'ನಿಮ್ಮ ಉಳಿಸಿದ ಯಾವ ವಿವರವೂ ಈ ಫಾರ್ಮ್ ಫೀಲ್ಡ್‌ಗಳಿಗೆ ಹೊಂದಿಕೆಯಾಗಲಿಲ್ಲ.'],
  ['errCouldNotMatch', 'Could not match form fields.', 'फॉर्म फ़ील्ड मिलाए नहीं जा सके।', 'ಫಾರ್ಮ್ ಫೀಲ್ಡ್‌ಗಳನ್ನು ಹೊಂದಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'],
  ['fillReviewHeaderOne', 'Form Fill Review (1 field)', 'फॉर्म भरने की समीक्षा (1 फ़ील्ड)', 'ಫಾರ್ಮ್ ತುಂಬುವ ಪರಿಶೀಲನೆ (1 ಫೀಲ್ಡ್)'],
  ['fillReviewHeader', 'Form Fill Review ({n} fields)', 'फॉर्म भरने की समीक्षा ({n} फ़ील्ड)', 'ಫಾರ್ಮ್ ತುಂಬುವ ಪರಿಶೀಲನೆ ({n} ಫೀಲ್ಡ್‌ಗಳು)'],
  ['enterYourself', 'enter this yourself', 'यह खुद दर्ज करें', 'ಇದನ್ನು ನೀವೇ ನಮೂದಿಸಿ'],
  ['sensitiveBadge', 'Sensitive', 'संवेदनशील', 'ಸೂಕ್ಷ್ಮ'],
  ['applyBtn', 'Apply', 'लागू करें', 'ಅನ್ವಯಿಸಿ'],
  ['noRowsSelected', 'No rows selected.', 'कोई फ़ील्ड नहीं चुना गया।', 'ಯಾವುದೇ ಫೀಲ್ಡ್ ಆಯ್ಕೆ ಮಾಡಿಲ್ಲ.'],
  ['appliedFields', 'Applied {n} field(s).', '{n} फ़ील्ड भरे गए।', '{n} ಫೀಲ್ಡ್(ಗಳು) ತುಂಬಲಾಗಿದೆ.'],
  ['applyFailed', 'Apply failed.', 'भरना विफल रहा।', 'ತುಂಬಲು ವಿಫಲವಾಗಿದೆ.'],
  ['micListening', 'Listening... tap again to stop', 'सुन रहा है... रोकने के लिए फिर दबाएं', 'ಕೇಳುತ್ತಿದೆ... ನಿಲ್ಲಿಸಲು ಮತ್ತೆ ಒತ್ತಿ'],
  ['micListeningSpeech', 'Listening via browser speech... tap again to stop', 'ब्राउज़र स्पीच से सुन रहा है... रोकने के लिए फिर दबाएं', 'ಬ್ರೌಸರ್ ಧ್ವನಿಯಿಂದ ಕೇಳುತ್ತಿದೆ... ನಿಲ್ಲಿಸಲು ಮತ್ತೆ ಒತ್ತಿ'],
  ['micTranscribing', 'Transcribing...', 'आवाज़ को लिखा जा रहा है...', 'ಧ್ವನಿಯನ್ನು ಬರೆಯಲಾಗುತ್ತಿದೆ...'],
  ['micFinishing', 'Finishing speech...', 'आवाज़ पूरी हो रही है...', 'ಧ್ವನಿ ಮುಕ್ತಾಯವಾಗುತ್ತಿದೆ...'],
  ['micTooShort', 'That was too short. Tap the mic, speak, then tap again.', 'यह बहुत छोटा था। माइक दबाएं, बोलें, फिर दोबारा दबाएं।', 'ಇದು ತುಂಬಾ ಚಿಕ್ಕದಾಗಿತ್ತು. ಮೈಕ್ ಒತ್ತಿ, ಮಾತನಾಡಿ, ನಂತರ ಮತ್ತೆ ಒತ್ತಿ.'],
  ['micNoAudio', "I couldn't hear anything. Try again closer to the mic.", 'कुछ सुनाई नहीं दिया। माइक के पास फिर से बोलें।', 'ಏನೂ ಕೇಳಿಸಲಿಲ್ಲ. ಮೈಕ್ ಹತ್ತಿರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.'],
  ['micWrongScript', 'I heard this as English. Speak a little slower, or check the language in the header.', 'यह अंग्रेज़ी जैसा सुनाई दिया। थोड़ा धीरे बोलें या ऊपर भाषा जाँचें।', 'ಇದು ಇಂಗ್ಲಿಷ್‌ನಂತೆ ಕೇಳಿಸಿತು. ಸ್ವಲ್ಪ ನಿಧಾನವಾಗಿ ಮಾತನಾಡಿ ಅಥವಾ ಮೇಲಿನ ಭಾಷೆ ಪರಿಶೀಲಿಸಿ.'],
  ['micAllowTab', 'Please allow the microphone in the tab that just opened, then press the mic again.', 'खुले हुए टैब में माइक की अनुमति दें, फिर माइक दबाएं।', 'ತೆರೆದ ಟ್ಯಾಬ್‌ನಲ್ಲಿ ಮೈಕ್ ಅನುಮತಿ ನೀಡಿ, ನಂತರ ಮೈಕ್ ಮತ್ತೆ ಒತ್ತಿ.'],
  ['stopRecAria', 'Stop recording', 'रिकॉर्डिंग रोकें', 'ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲಿಸಿ'],
  ['errVoiceFail', 'Voice transcription failed.', 'आवाज़ लिखना विफल रहा।', 'ಧ್ವನಿ ಬರವಣಿಗೆ ವಿಫಲವಾಗಿದೆ.'],
  ['errVoiceInput', 'Voice input failed.', 'आवाज़ इनपुट विफल रहा।', 'ಧ್ವನಿ ಇನ್‌ಪುಟ್ ವಿಫಲವಾಗಿದೆ.'],
  ['errMicAccess', 'Could not access microphone.', 'माइक का उपयोग नहीं हो सका।', 'ಮೈಕ್ ಪ್ರವೇಶಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'],
  ['errRecFailed', 'Recording failed.', 'रिकॉर्डिंग विफल रही।', 'ರೆಕಾರ್ಡಿಂಗ್ ವಿಫಲವಾಗಿದೆ.'],
  ['searchDetailsPh', 'Search saved details...', 'सहेजे विवरण खोजें...', 'ಉಳಿಸಿದ ವಿವರಗಳನ್ನು ಹುಡುಕಿ...'],
  ['addDetailBtn', 'Add detail', 'विवरण जोड़ें', 'ವಿವರ ಸೇರಿಸಿ'],
  ['detailLabelPh', 'Label (e.g. Full Name, Email, PAN)', 'नाम (जैसे पूरा नाम, ईमेल, PAN)', 'ಹೆಸರು (ಉದಾ. ಪೂರ್ಣ ಹೆಸರು, ಇಮೇಲ್, PAN)'],
  ['detailValuePh', 'Value', 'मान', 'ಮೌಲ್ಯ'],
  ['detailGroupPh', 'Group (e.g. Personal, Work)', 'समूह (जैसे व्यक्तिगत, काम)', 'ಗುಂಪು (ಉದಾ. ವೈಯಕ್ತಿಕ, ಕೆಲಸ)'],
  ['detailSensCheck', 'Sensitive (never sent or auto-filled)', 'संवेदनशील (AI को न भेजें, न अपने आप भरें)', 'ಸೂಕ್ಷ್ಮ (AI ಗೆ ಕಳುಹಿಸುವುದಿಲ್ಲ, ಸ್ವಯಂ ತುಂಬುವುದಿಲ್ಲ)'],
  ['saveBtn', 'Save', 'सहेजें', 'ಉಳಿಸಿ'],
  ['detailSaved', 'Saved detail updated.', 'विवरण सहेजा गया।', 'ವಿವರವನ್ನು ಉಳಿಸಲಾಗಿದೆ.'],
  ['detailsEmptyNone', 'No saved details yet. Click "Add detail" to save reusable text.', 'अभी कोई विवरण नहीं है। जोड़ने के लिए "विवरण जोड़ें" दबाएं।', 'ಇನ್ನೂ ಯಾವುದೇ ವಿವರಗಳಿಲ್ಲ. ಸೇರಿಸಲು "ವಿವರ ಸೇರಿಸಿ" ಒತ್ತಿ.'],
  ['detailsEmptyNoMatch', 'No matching details.', 'कोई मिलता विवरण नहीं।', 'ಹೊಂದಿಕೆಯಾಗುವ ವಿವರಗಳಿಲ್ಲ.'],
  ['insertBtn', 'Insert', 'डालें', 'ಸೇರಿಸಿ'],
  ['copyBtn', 'Copy', 'कॉपी', 'ನಕಲಿಸಿ'],
  ['copiedBtn', 'Copied', 'कॉपी हुआ', 'ನಕಲಿಸಲಾಗಿದೆ'],
  ['clipboardFailed', 'Clipboard access failed.', 'क्लिपबोर्ड कॉपी विफल रहा।', 'ಕ್ಲಿಪ್‌ಬೋರ್ಡ್ ನಕಲು ವಿಫಲವಾಗಿದೆ.'],
  ['editBtn', 'Edit', 'बदलें', 'ತಿದ್ದು'],
  ['deleteBtn', 'Delete', 'हटाएं', 'ಅಳಿಸಿ'],
  ['insertedDetail', 'Inserted "{label}" into focused field.', 'चुने बॉक्स में "{label}" डाल दिया गया।', 'ಆಯ್ದ ಬಾಕ್ಸ್‌ನಲ್ಲಿ "{label}" ಸೇರಿಸಲಾಗಿದೆ.'],
  ['noFieldFocused', 'No field focused on the page. Click into an input box first.', 'पेज पर कोई बॉक्स चुना नहीं गया। पहले इनपुट बॉक्स में क्लिक करें।', 'ಪುಟದಲ್ಲಿ ಯಾವುದೇ ಬಾಕ್ಸ್ ಆಯ್ಕೆಯಾಗಿಲ್ಲ. ಮೊದಲು ಇನ್‌ಪುಟ್ ಬಾಕ್ಸ್ ಮೇಲೆ ಕ್ಲಿಕ್ ಮಾಡಿ.'],
  ['insertFailed', 'Could not insert value.', 'मान डाला नहीं जा सका।', 'ಮೌಲ್ಯವನ್ನು ಸೇರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'],
  ['helperEmptyHint', 'Type a goal below (e.g. "help me fill this form") for guided steps.', 'नीचे लक्ष्य लिखें (जैसे "फॉर्म भरने में मदद करें")।', 'ಕೆಳಗೆ ಗುರಿಯನ್ನು ಬರೆಯಿರಿ (ಉದಾ. "ಈ ಫಾರ್ಮ್ ತುಂಬಲು ಸಹಾಯ ಮಾಡಿ").'],
  ['guidedSteps', 'Guided Steps', 'कदम सूची', 'ಮಾರ್ಗದರ್ಶಿ ಹಂತಗಳು'],
  ['doItBtn', 'Do it for me', 'मेरे लिए करें', 'ನನಗಾಗಿ ಮಾಡಿ'],
  ['doneBtn', 'Done', 'हो गया', 'ಮುಗಿದಿದೆ'],
  ['replanBtn', 'Re-plan', 'फिर योजना बनाएं', 'ಮತ್ತೆ ಯೋಜಿಸಿ'],
  ['closeBtn', 'Close', 'बंद करें', 'ಮುಚ್ಚಿ'],
  ['prefixDone', '[Done] ', '[हो गया] ', '[ಮುಗಿದಿದೆ] '],
  ['prefixSkipped', '[Skipped] ', '[छोड़ा] ', '[ಬಿಟ್ಟಿದೆ] '],
  ['replanCapMsg', 'Page changed after 2 automatic re-plans. Click Re-plan to update steps.', 'पेज 2 बार अपने आप री-प्लान के बाद बदला। "फिर योजना बनाएं" दबाएं।', '2 ಸ್ವಯಂ ಮರು-ಯೋಜನೆಗಳ ನಂತರ ಪುಟ ಬದಲಾಗಿದೆ. "ಮತ್ತೆ ಯೋಜಿಸಿ" ಒತ್ತಿ.'],
  ['allStepsDone', 'All steps done. Review the page, then submit it yourself.', 'सभी कदम पूरे हुए। पेज जाँचें और खुद Submit करें।', 'ಎಲ್ಲಾ ಹಂತಗಳು ಮುಗಿದಿವೆ. ಪುಟ ಪರಿಶೀಲಿಸಿ ನೀವೇ Submit ಮಾಡಿ.'],
  ['buildingSteps', 'Building steps...', 'कदम बनाए जा रहे हैं...', 'ಹಂತಗಳನ್ನು ರಚಿಸಲಾಗುತ್ತಿದೆ...'],
  ['updatingPlan', 'Updating plan...', 'योजना बदली जा रही है...', 'ಯೋಜನೆಯನ್ನು ನವೀಕರಿಸಲಾಗುತ್ತಿದೆ...'],
  ['couldntBuildSteps', "I couldn't build steps for this page", 'मैं इस पेज के लिए कदम नहीं बना पाया', 'ಈ ಪುಟಕ್ಕಾಗಿ ನನಗೆ ಹಂತಗಳನ್ನು ರಚಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ'],
  ['errBuildSteps', 'Could not build steps for this page.', 'इस पेज के लिए कदम नहीं बन पाए।', 'ಈ ಪುಟಕ್ಕಾಗಿ ಹಂತಗಳನ್ನು ರಚಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'],
  ['noSavedDetailFor', 'No saved detail for "{label}". Enter it manually or press Done.', '"{label}" के लिए सहेजा विवरण नहीं है। खुद भरें या "हो गया" दबाएं।', '"{label}" ಗಾಗಿ ಉಳಿಸಿದ ವಿವರವಿಲ್ಲ. ನೀವೇ ನಮೂದಿಸಿ ಅಥವಾ "ಮುಗಿದಿದೆ" ಒತ್ತಿ.'],
  ['savedValNoMatch', 'Saved value does not match "{label}" options.', 'सहेजा मान "{label}" विकल्पों से मेल नहीं खाता।', 'ಉಳಿಸಿದ ಮೌಲ್ಯ "{label}" ಆಯ್ಕೆಗಳಿಗೆ ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ.'],
  ['settingsTitleFull', 'FormMitra — Settings', 'FormMitra — Settings', 'FormMitra — Settings'],
  ['settingsHeading', 'FormMitra Settings', 'FormMitra Settings', 'FormMitra Settings'],
  ['settingsSubtitle', 'API keys and saved details stay locally in your browser.', 'API key और सहेजे विवरण केवल आपके ब्राउज़र में सुरक्षित रहते हैं।', 'API key ಮತ್ತು ಉಳಿಸಿದ ವಿವರಗಳು ನಿಮ್ಮ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಮಾತ್ರ ಉಳಿಯುತ್ತವೆ.'],
  ['langLabel', 'Language', 'भाषा', 'ಭಾಷೆ'],
  ['headingProviders', 'AI providers', 'AI प्रदाता', 'AI ಪೂರೈಕೆದಾರರು'],
  ['refreshModelsBtn', 'Refresh models', 'मॉडल रिफ्रेश करें', 'ಮಾಡೆಲ್‌ಗಳನ್ನು ರಿಫ್ರೆಶ್ ಮಾಡಿ'],
  ['geminiKeyLabel', 'Gemini API Key', 'Gemini API key', 'Gemini API key'],
  ['geminiKeyPh', 'Paste your Gemini API key', 'अपनी Gemini API key यहाँ पेस्ट करें', 'ನಿಮ್ಮ Gemini API key ಇಲ್ಲಿ ಅಂಟಿಸಿ'],
  ['testConnBtn', 'Test Connection', 'कनेक्शन जाँचें', 'ಸಂಪರ್ಕ ಪರೀಕ್ಷಿಸಿ'],
  ['modelLabel', 'Model', 'मॉडल', 'ಮಾಡೆಲ್'],
  ['groqKeyLabel', 'Groq API Key', 'Groq API key', 'Groq API key'],
  ['groqKeyPh', 'Paste your Groq API key', 'अपनी Groq API key यहाँ पेस्ट करें', 'ನಿಮ್ಮ Groq API key ಇಲ್ಲಿ ಅಂಟಿಸಿ'],
  ['headingDetails', 'Saved details', 'सहेजे विवरण', 'ಉಳಿಸಿದ ವಿವರಗಳು'],
  ['headingData', 'Data', 'डेटा', 'ಡೇಟಾ'],
  ['dataDesc', 'Remove saved API keys, model selections, saved details, and preferences from local browser storage.', 'ब्राउज़र से सभी API key, मॉडल, सहेजे विवरण और सेटिंग्स हटाएं।', 'ಬ್ರೌಸರ್‌ನಿಂದ ಉಳಿಸಿದ API key, ಮಾಡೆಲ್, ವಿವರಗಳು ಮತ್ತು ಆದ್ಯತೆಗಳನ್ನು ಅಳಿಸಿ.'],
  ['deleteAllBtn', 'Delete all my data', 'मेरा सारा डेटा हटाएं', 'ನನ್ನ ಎಲ್ಲಾ ಡೇಟಾ ಅಳಿಸಿ'],
  ['loadedModels', 'Loaded {n} models.', '{n} मॉडल लोड हुए।', '{n} ಮಾಡೆಲ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಿದೆ.'],
  ['couldNotLoadModels', 'Could not load models.', 'मॉडल लोड नहीं हो सके।', 'ಮಾಡೆಲ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'],
  ['keySaved', 'API key saved locally.', 'API key सहेजी गई।', 'API key ಉಳಿಸಲಾಗಿದೆ.'],
  ['keyCleared', 'API key cleared.', 'API key हटाई गई।', 'API key ತೆರವುಗೊಳಿಸಲಾಗಿದೆ.'],
  ['pasteKeyFirst', 'Paste an API key first.', 'पहले API key पेस्ट करें।', 'ಮೊದಲು API key ಅಂಟಿಸಿ.'],
  ['testingConn', 'Testing connection...', 'कनेक्शन जाँचा जा रहा है...', 'ಸಂಪರ್ಕ ಪರೀಕ್ಷಿಸಲಾಗುತ್ತಿದೆ...'],
  ['connectedModel', 'Connected ({model}).', 'कनेक्शन सफल ({model})।', 'ಸಂಪರ್ಕ ಯಶಸ್ವಿ ({model}).'],
  ['connFailed', 'Connection failed.', 'कनेक्शन विफल रहा।', 'ಸಂಪರ್ಕ ವಿಫಲವಾಗಿದೆ.'],
  ['refreshingModels', 'Refreshing available models...', 'मॉडल सूची अपडेट हो रही है...', 'ಲಭ್ಯವಿರುವ ಮಾಡೆಲ್‌ಗಳನ್ನು ರಿಫ್ರೆಶ್ ಮಾಡಲಾಗುತ್ತಿದೆ...'],
  ['addOneKeyFirst', 'Add at least one API key first.', 'पहले कम से कम एक API key जोड़ें।', 'ಮೊದಲು ಕನಿಷ್ಠ ಒಂದು API key ಸೇರಿಸಿ.'],
  ['modelsRefreshed', 'Models refreshed ({parts}).', 'मॉडल रिफ्रेश हुए ({parts})।', 'ಮಾಡೆಲ್‌ಗಳು ರಿಫ್ರೆಶ್ ಆಗಿವೆ ({parts}).'],
  ['providerFailedCount', '{provider} failed', '{provider} विफल', '{provider} ವಿಫಲ'],
  ['deleteConfirm', 'Delete all API keys, saved details, model choices, and preferences stored by FormMitra?', 'FormMitra में सहेजी सभी API key, विवरण, मॉडल और सेटिंग्स हटाएं?', 'FormMitra ದಲ್ಲಿ ಉಳಿಸಿದ ಎಲ್ಲಾ API key, ವಿವರಗಳು, ಮಾಡೆಲ್ ಮತ್ತು ಆದ್ಯತೆಗಳನ್ನು ಅಳಿಸಬೇಕೇ?'],
  ['allDataDeleted', 'All data deleted.', 'सारा डेटा हटाया गया।', 'ಎಲ್ಲಾ ಡೇಟಾ ಅಳಿಸಲಾಗಿದೆ.'],
  ['noBgResp', 'No response from background.', 'बैकग्राउंड सेवा से उत्तर नहीं मिला।', 'ಹಿನ್ನೆಲೆ ಸೇವೆಯಿಂದ ಉತ್ತರ ಬರಲಿಲ್ಲ.']
];

export const STRINGS = { en: {}, hi: {}, kn: {} };
for (const [k, en, hi, kn] of DICT) { STRINGS.en[k] = en; STRINGS.hi[k] = hi; STRINGS.kn[k] = kn; }
let currentLang = 'en';
export function getLang() { return currentLang; }
export function t(key, vars = null) {
  const raw = STRINGS[currentLang]?.[key] ?? STRINGS.en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    if (v === undefined || v === null) return `{${k}}`;
    return typeof v === 'string' && v.startsWith('@i18n:') ? t(v.slice(6)) : String(v);
  });
}
export function clearI18n(el) {
  if (!el) return el;
  delete el.dataset.i18n;
  delete el.dataset.i18nVars;
  return el;
}
export function bindI18n(el, key, vars = null) {
  if (!el) return el;
  el.dataset.i18n = key;
  if (vars) el.dataset.i18nVars = JSON.stringify(vars);
  else delete el.dataset.i18nVars;
  el.textContent = t(key, vars);
  return el;
}
export function applyI18n(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    let vars = null;
    if (el.dataset.i18nVars) { try { vars = JSON.parse(el.dataset.i18nVars); } catch (_) {} }
    el.textContent = t(el.dataset.i18n, vars);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}
export function setLang(code, { persist = true, root = document } = {}) {
  currentLang = ['en', 'hi', 'kn'].includes(code) ? code : 'en';
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = currentLang;
  applyI18n(root);
  return persist ? saveSettingsPatch({ whLang: currentLang }) : Promise.resolve();
}
