import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { initializeApp } from 'firebase/app';
import { get, getDatabase, onValue, push, ref, remove, set } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// --- FIREBASE CLOUD CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBmciZAJPXrkHtlN5-fdBBufN2EGaNs1xQ",
  databaseURL: "https://pcnotes-ad746-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "pcnotes-ad746",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Tell Android how to handle notifications when the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  // --- Core States ---
  const [screen, setScreen] = useState('notes'); 
  const [appIdentity, setAppIdentity] = useState('Notes'); 
  const [calcInput, setCalcInput] = useState('0');
  const [notesText, setNotesText] = useState('');

  // --- Auth & Token States ---
  const [authMode, setAuthMode] = useState('login'); 
  const [authPhone, setAuthPhone] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authName, setAuthName] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [expoPushToken, setExpoPushToken] = useState('');

  // --- Network & Data States ---
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stories, setStories] = useState<any[]>([]);

  // --- UI States ---
  const [mainMenuVisible, setMainMenuVisible] = useState(false);
  const [menuView, setMenuView] = useState('main'); 
  const [newPinInput, setNewPinInput] = useState('');
  const [activeChat, setActiveChat] = useState<any>(null);
  
  // --- Profile / DP / Menus ---
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [bioInput, setBioInput] = useState('');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);

  // --- NEW FEATURE STATES ---
  const [opponentTyping, setOpponentTyping] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | undefined>();

  // ==========================================
  // HARDWARE ENGINE: Push Notifications
  // ==========================================
  useEffect(() => {
    if (currentUser) {
      registerForPushNotificationsAsync().then(token => {
        if (token) {
          setExpoPushToken(token);
          set(ref(db, `users/${currentUser.phone}/pushToken`), token);
        }
      });
    }
  }, [currentUser]);

  async function registerForPushNotificationsAsync() {
    let token;
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        alert('Failed to get push token for push notification!');
        return;
      }
      try {
        token = (await Notifications.getExpoPushTokenAsync({
           projectId: Constants.expoConfig?.extra?.eas?.projectId || undefined,
        })).data;
      } catch (error) {
        console.log("Token Fetch Error: ", error);
      }
    } else {
      console.log('Must use physical device for Push Notifications');
    }

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#39FF14',
      });
    }
    return token;
  }

  // ==========================================
  // CLOUD ENGINE: Master Sync
  // ==========================================
  useEffect(() => {
    if (currentUser) {
      const usersRef = ref(db, 'users');
      onValue(usersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const usersArray = Object.keys(data).map(phone => ({ phone, ...data[phone] }));
          if (data[currentUser.phone]) setCurrentUser({ phone: currentUser.phone, ...data[currentUser.phone] });

          const myFriends = data[currentUser.phone]?.friends || {};
          const friendsData = usersArray.filter(u => myFriends[u.phone]);
          setFriendsList(friendsData);

          const allStories = [];
          if (data[currentUser.phone]?.story) allStories.push({ phone: currentUser.phone, name: 'My Story', story: data[currentUser.phone].story, dp: data[currentUser.phone].dp });
          friendsData.forEach(f => {
            if (f.story) allStories.push({ phone: f.phone, name: f.name, story: f.story, dp: f.dp });
          });
          setStories(allStories);
        }
      });

      const reqRef = ref(db, `requests/${currentUser.phone}`);
      onValue(reqRef, (snapshot) => {
        const data = snapshot.val();
        setPendingRequests(data ? Object.keys(data) : []);
      });
    }
  }, [currentUser]);

  // --- CLOUD ENGINE: Live Chat & Typing Indicator ---
  useEffect(() => {
    if (activeChat && currentUser) {
      const chatId = [currentUser.phone, activeChat.phone].sort().join('_');
      
      // Messages Sync
      const messagesRef = ref(db, `chats/${chatId}/messages`);
      const unsubscribeMsg = onValue(messagesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) setChatMessages(Object.keys(data).map(key => ({ id: key, ...data[key] })));
        else setChatMessages([]);
      });

      // Typing Status Sync (NEW)
      const typingRef = ref(db, `chats/${chatId}/typing/${activeChat.phone}`);
      const unsubscribeTyping = onValue(typingRef, (snapshot) => {
        setOpponentTyping(snapshot.val() || false);
      });

      return () => { unsubscribeMsg(); unsubscribeTyping(); }; 
    }
  }, [activeChat, currentUser]);

  // ==========================================
  // NEW FEATURE: Biometrics, Voice, Burn, Call
  // ==========================================

  // 4. Biometric Auth
  const handleBiometricAuth = async () => {
    if (!authPhone) return alert("Enter your phone number first to use Fingerprint.");
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const auth = await LocalAuthentication.authenticateAsync({ promptMessage: 'Vault Access' });
      if (auth.success) {
        const snapshot = await get(ref(db, 'users/' + authPhone));
        if (!snapshot.exists()) return alert("Number not found.");
        await set(ref(db, `users/${authPhone}/lastOnline`), Date.now());
        setCurrentUser({ phone: authPhone, ...snapshot.val() });
        setScreen('social');
      }
    } else {
      alert("Biometrics not available on this device.");
    }
  };

  // 6. Burn Protocol
  const triggerBurnProtocol = () => {
    Alert.alert("🔥 BURN PROTOCOL", "Are you sure? This permanently deletes the chat history for both users.", [
        { text: "Cancel", style: "cancel" },
        { text: "BURN", style: "destructive", onPress: () => {
            const chatId = [currentUser.phone, activeChat.phone].sort().join('_');
            remove(ref(db, `chats/${chatId}/messages`));
            alert("No evidence remains.");
        }}
    ]);
  };

  // 7. Live Typing Handler
  const handleTyping = (text: string) => {
    setMessageInput(text);
    if (activeChat && currentUser) {
      const chatId = [currentUser.phone, activeChat.phone].sort().join('_');
      set(ref(db, `chats/${chatId}/typing/${currentUser.phone}`), text.length > 0);
    }
  };

  // 9. Voice Memos
  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) { console.error('Failed to start recording', err); }
  }

  async function stopRecording() {
    setRecording(undefined);
    if (recording) {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) sendMessage('', '', uri);
    }
  }

  // Audio/Video Calling
  const startVideoCall = () => Alert.alert("Secure Video", "ZegoCloud API required to connect video stream.");
  const startAudioCall = () => Alert.alert("Secure Audio", "ZegoCloud API required to connect audio stream.");

  // ==========================================
  // LOGIC HANDLERS
  // ==========================================
  const handleCalc = (val: string) => {
    let newVal = calcInput === '0' ? val : calcInput + val;
    if (val === 'C') newVal = '0';
    setCalcInput(newVal);
    if (newVal.includes('1234')) { setScreen('auth'); setCalcInput('0'); setAuthPhone(''); setAuthPin(''); }
  };

  const handleRegister = async () => {
    if (!authPhone || !authPin || !authName) return alert("Fill all fields");
    const userRef = ref(db, 'users/' + authPhone);
    const snapshot = await get(userRef);
    if (snapshot.exists()) return alert("Number already registered!");
    const newUser = { phone: authPhone, pin: authPin, name: authName, dp: '', bio: 'Encrypted Node', lastOnline: Date.now() };
    await set(userRef, newUser);
    setCurrentUser(newUser);
    setScreen('social');
  };

  const handleLogin = async () => {
    const snapshot = await get(ref(db, 'users/' + authPhone));
    if (!snapshot.exists()) return alert("Number not found.");
    if (snapshot.val().pin !== authPin) return alert("Incorrect PIN!");
    await set(ref(db, `users/${authPhone}/lastOnline`), Date.now());
    setCurrentUser({ phone: authPhone, ...snapshot.val() });
    setScreen('social');
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    const snapshot = await get(ref(db, 'users/' + searchQuery));
    if (snapshot.exists()) {
      openProfile({ phone: searchQuery, ...snapshot.val() });
      setSearchQuery('');
    } else {
      alert("No node found with this exact number.");
    }
  };

  const sendMessage = async (text: string, imageBase64: string = '', audioUri: string = '') => {
    if (!text.trim() && !imageBase64 && !audioUri) return;
    const chatId = [currentUser.phone, activeChat.phone].sort().join('_');
    
    // Save to database
    await push(ref(db, `chats/${chatId}/messages`), { 
      text: text, 
      image: imageBase64,
      audio: audioUri,
      sender: currentUser.phone, 
      time: Date.now() 
    });
    
    // Reset typing status
    set(ref(db, `chats/${chatId}/typing/${currentUser.phone}`), false);

    // Push notification
    if (activeChat.pushToken) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeChat.pushToken,
          sound: 'default',
          title: `Vault: ${currentUser.name}`,
          body: audioUri ? '🎤 Sent a voice memo' : (text ? text : '📸 Sent an encrypted image'),
        }),
      });
    }

    setMessageInput('');
    setAttachMenuVisible(false);
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ==========================================
  // PROFILE & MEDIA HANDLERS
  // ==========================================
  const openProfile = (user: any) => {
    setSelectedProfile(user);
    setBioInput(user.bio || '');
    setIsEditingBio(false);
    setProfileModalVisible(true);
  };

  const pickImage = async (type: 'dp' | 'story' | 'chat') => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.1, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (type === 'dp') await set(ref(db, `users/${currentUser.phone}/dp`), base64Img);
      if (type === 'story') await set(ref(db, `users/${currentUser.phone}/story`), base64Img);
      if (type === 'chat') sendMessage('', base64Img);
    }
  };

  const removeDP = async () => await set(ref(db, `users/${currentUser.phone}/dp`), '');
  const saveBio = async () => { await set(ref(db, `users/${currentUser.phone}/bio`), bioInput); setIsEditingBio(false); };
  
  const sendFriendRequest = async () => {
    await set(ref(db, `requests/${selectedProfile.phone}/${currentUser.phone}`), true);
    alert('Request Sent!');
  };

  const acceptRequest = async (senderPhone: string) => {
    await set(ref(db, `users/${currentUser.phone}/friends/${senderPhone}`), true);
    await set(ref(db, `users/${senderPhone}/friends/${currentUser.phone}`), true);
    await remove(ref(db, `requests/${currentUser.phone}/${senderPhone}`));
  };

  const removeFriend = async (friendPhone: string) => {
    await remove(ref(db, `users/${currentUser.phone}/friends/${friendPhone}`));
    await remove(ref(db, `users/${friendPhone}/friends/${currentUser.phone}`));
    setProfileModalVisible(false);
    alert('Node Disconnected.');
  };

  // ==========================================
  // DECOY & AUTH SCREENS
  // ==========================================
  if (screen === 'notes') {
    return (
      <View style={styles.decoyContainer}>
        <View style={styles.decoyHeader}>
          <Text style={styles.decoyTitle}>{appIdentity}</Text>
          <TouchableOpacity onPress={() => setScreen('calc')}><Text style={styles.decoyDot}>⋮</Text></TouchableOpacity>
        </View>
        <TextInput style={styles.decoyInput} multiline value={notesText} placeholder="Type notes..." onChangeText={(t) => { setNotesText(t); if (t.toLowerCase().includes('sourabh')) { setScreen('calc'); setNotesText(''); } }} />
      </View>
    );
  }

  if (screen === 'calc') {
    return (
      <View style={styles.calcContainer}>
        <Text style={styles.calcDisplay}>{calcInput}</Text>
        <View style={styles.calcPad}>
          {[['C','+/-','%','÷'],['7','8','9','×'],['4','5','6','-'],['1','2','3','+'],['0','.','=']].map((row, i) => (
            <View key={i} style={styles.calcRow}>
              {row.map(k => <TouchableOpacity key={k} style={[styles.calcBtn, ['÷','×','-','+','='].includes(k) ? styles.calcBtnOp : null]} onPress={() => handleCalc(k)}><Text style={styles.calcBtnText}>{k}</Text></TouchableOpacity>)}
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (screen === 'auth') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.authTitle}>VAULT ACCESS</Text>
        <View style={styles.authToggle}>
          <TouchableOpacity onPress={() => setAuthMode('login')} style={[styles.authTab, authMode === 'login' && styles.authTabActive]}><Text style={authMode === 'login' ? {color: '#000'} : {color: '#666'}}>LOGIN</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode('register')} style={[styles.authTab, authMode === 'register' && styles.authTabActive]}><Text style={authMode === 'register' ? {color: '#000'} : {color: '#666'}}>REGISTER</Text></TouchableOpacity>
        </View>
        <TextInput style={styles.authInput} placeholder="Phone (Exact 10 digits)" placeholderTextColor="#444" value={authPhone} onChangeText={setAuthPhone} />
        {authMode === 'register' && <TextInput style={styles.authInput} placeholder="Username" placeholderTextColor="#444" value={authName} onChangeText={setAuthName} />}
        <TextInput style={styles.authInput} placeholder="PIN" placeholderTextColor="#444" value={authPin} onChangeText={setAuthPin} secureTextEntry />
        
        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 10}}>
          <TouchableOpacity style={[styles.authBtn, {flex: 1, marginRight: 10}]} onPress={authMode === 'login' ? handleLogin : handleRegister}>
            <Text style={{color: '#000', fontWeight: 'bold'}}>{authMode === 'login' ? 'ENTER' : 'CREATE'}</Text>
          </TouchableOpacity>
          {authMode === 'login' && (
            <TouchableOpacity style={[styles.authBtn, {backgroundColor: '#222'}]} onPress={handleBiometricAuth}>
              <Text style={{fontSize: 20}}>🪪</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ==========================================
  // LIVE CHAT ROOM
  // ==========================================
  if (screen === 'chatRoom') {
    return (
      <View style={styles.vaultContainer}>
        <View style={styles.chatRoomHeader}>
          <TouchableOpacity onPress={() => setScreen('social')}><Text style={{color: '#39FF14', fontSize: 30}}>←</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => openProfile(activeChat)} style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
            {activeChat?.dp ? <Image source={{uri: activeChat.dp}} style={styles.chatHeaderDP} /> : <View style={styles.chatHeaderDP}><Text style={{color:'#39FF14'}}>{activeChat?.name[0]}</Text></View>}
            <View style={{marginLeft: 10}}>
              <Text style={{color: '#39FF14', fontSize: 18, fontWeight: 'bold'}}>{activeChat?.name}</Text>
              <Text style={{color: '#888', fontSize: 10}}>Last Online: {activeChat?.lastOnline ? formatTime(activeChat.lastOnline) : 'Recently'}</Text>
            </View>
          </TouchableOpacity>
          {/* NEW CALL & BURN BUTTONS */}
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <TouchableOpacity onPress={startAudioCall} style={{marginRight: 15}}><Text style={{fontSize: 20}}>📞</Text></TouchableOpacity>
            <TouchableOpacity onPress={startVideoCall} style={{marginRight: 15}}><Text style={{fontSize: 20}}>📹</Text></TouchableOpacity>
            <TouchableOpacity onPress={triggerBurnProtocol}><Text style={{fontSize: 20}}>🔥</Text></TouchableOpacity>
          </View>
        </View>

        <ScrollView style={{flex: 1, padding: 15}}>
           {chatMessages.map((msg, index) => {
             const isMe = msg.sender === currentUser.phone;
             return (
               <View key={index} style={[isMe ? styles.msgBubbleMe : styles.msgBubble, { backgroundColor: isMe ? '#39FF14' : '#111' }]}>
                 {msg.image && <Image source={{uri: msg.image}} style={{width: 200, height: 200, borderRadius: 10, marginBottom: 5}} />}
                 {msg.audio && <TouchableOpacity style={{backgroundColor: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 5, marginBottom: 5}} onPress={() => alert('Audio Playback: ' + msg.audio)}><Text style={{color: isMe ? '#000' : '#39FF14'}}>▶ Play Voice Memo</Text></TouchableOpacity>}
                 {msg.text !== '' && <Text style={{color: isMe ? '#000' : '#fff', fontSize: 16}}>{msg.text}</Text>}
                 <Text style={{color: isMe ? '#222' : '#666', fontSize: 10, alignSelf: 'flex-end', marginTop: 5}}>{formatTime(msg.time)}</Text>
               </View>
             )
           })}
        </ScrollView>

        {/* LIVE TYPING INDICATOR */}
        {opponentTyping && <Text style={{color: '#39FF14', fontStyle: 'italic', paddingHorizontal: 15, paddingBottom: 5, fontSize: 12}}>@{activeChat?.name} is typing...</Text>}

        {attachMenuVisible && (
          <View style={styles.attachMenu}>
            <TouchableOpacity onPress={() => pickImage('chat')} style={styles.attachIcon}><Text style={{fontSize: 24}}>📸</Text><Text style={{color:'#39FF14', fontSize: 10}}>Media</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => alert('GPS Node Offline')} style={styles.attachIcon}><Text style={{fontSize: 24}}>📍</Text><Text style={{color:'#39FF14', fontSize: 10}}>Location</Text></TouchableOpacity>
          </View>
        )}

        <View style={styles.chatInputArea}>
          <TouchableOpacity onPress={() => setAttachMenuVisible(!attachMenuVisible)} style={{marginRight: 10, justifyContent: 'center'}}><Text style={{color: '#39FF14', fontSize: 30}}>+</Text></TouchableOpacity>
          <TextInput style={styles.chatRoomInput} placeholder="Message..." placeholderTextColor="#39FF14" value={messageInput} onChangeText={handleTyping} />
          {/* NEW VOICE MEMO BUTTON */}
          <TouchableOpacity onPressIn={startRecording} onPressOut={stopRecording} style={{justifyContent: 'center', marginRight: 10}}>
             <Text style={{fontSize: 24, opacity: recording ? 0.5 : 1}}>🎤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chatSendBtn} onPress={() => sendMessage(messageInput)}><Text style={{color: '#000', fontWeight: 'bold'}}>SEND</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  // ==========================================
  // MAIN SOCIAL VAULT (Friends & Stories)
  // ==========================================
  return (
    <View style={styles.vaultContainer}>
      {pendingRequests.length > 0 && (
        <View style={styles.notificationBar}>
          <Text style={{color: '#000', fontWeight: 'bold'}}>You have {pendingRequests.length} pending request(s)!</Text>
          {pendingRequests.map(phone => (
             <TouchableOpacity key={phone} onPress={() => acceptRequest(phone)} style={{backgroundColor: '#000', padding: 5, borderRadius: 5, marginTop: 5}}>
               <Text style={{color: '#39FF14', fontSize: 12}}>Accept Node: {phone}</Text>
             </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.vaultHeader}>
        <TextInput style={styles.vaultSearch} placeholder="Add friend by exact number..." placeholderTextColor="#444" value={searchQuery} onChangeText={setSearchQuery} keyboardType="number-pad" />
        <TouchableOpacity style={{marginLeft: 10, padding: 10, backgroundColor: '#111', borderRadius: 10}} onPress={handleSearch}><Text style={{color: '#39FF14'}}>🔍</Text></TouchableOpacity>
        <TouchableOpacity style={{marginLeft: 15}} onPress={() => {setMenuView('main'); setMainMenuVisible(true);}}><Text style={{color: '#39FF14', fontSize: 24}}>⋮</Text></TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.profileBar} onPress={() => openProfile(currentUser)}>
        {currentUser?.dp ? <Image source={{uri: currentUser.dp}} style={styles.miniDP} /> : <View style={styles.miniDP}><Text style={{color: '#39FF14'}}>{currentUser?.name[0]}</Text></View>}
        <View>
          <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold'}}>@{currentUser?.name}</Text>
          <Text style={{color: '#39FF14', fontSize: 10}}>Push Token: {expoPushToken ? 'ACTIVE' : 'PENDING'}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.storyContainer}>
        <FlatList 
          horizontal showsHorizontalScrollIndicator={false}
          data={[{ isAddBtn: true }, ...stories]}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({item}) => {
            if (item.isAddBtn) {
              return (
                <TouchableOpacity style={styles.storyItem} onPress={() => pickImage('story')}>
                  <View style={[styles.storyCircle, {borderWidth: 1, borderStyle: 'dashed'}]}><Text style={{color:'#39FF14', fontSize: 30}}>+</Text></View>
                  <Text style={styles.storyText}>Add Story</Text>
                </TouchableOpacity>
              )
            }
            return (
              <TouchableOpacity style={styles.storyItem} onPress={() => alert('Story View Module Pending')}>
                <Image source={{uri: item.story}} style={styles.storyCircle} />
                <Text style={styles.storyText}>{item.name}</Text>
              </TouchableOpacity>
            )
          }}
        />
      </View>

      <Text style={{color: '#444', fontWeight: 'bold', marginLeft: 20, marginBottom: 10}}>ENCRYPTED CONNECTIONS</Text>
      <FlatList 
        data={friendsList}
        keyExtractor={item => item.phone}
        renderItem={({item}) => (
          <View style={styles.chatItem}>
            <TouchableOpacity onPress={() => openProfile(item)}>
              {item.dp ? <Image source={{uri: item.dp}} style={styles.chatIcon} /> : <View style={styles.chatIcon}><Text style={{color: '#39FF14'}}>{item.name[0]}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity style={{flex: 1, marginLeft: 15}} onPress={() => { setActiveChat(item); setScreen('chatRoom'); }}>
              <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 16}}>{item.name}</Text>
              <Text style={{color: '#666', fontSize: 12}}>Tap to open channel</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={mainMenuVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.profileCard}>
            <TouchableOpacity style={styles.closeBtnAbsolute} onPress={() => setMainMenuVisible(false)}><Text style={{color: '#ff3333', fontSize: 20, fontWeight: 'bold'}}>X</Text></TouchableOpacity>
            {menuView === 'main' && (
              <>
                <Text style={styles.menuHeader}>SYSTEM SETTINGS</Text>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setMenuView('identity')}><Text style={styles.actionText}>Change App Identity ▶</Text></TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setMenuView('changePin')}><Text style={styles.actionText}>Change Login PIN ▶</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { borderColor: '#ff3333' }]} onPress={() => {setScreen('notes'); setMainMenuVisible(false);}}><Text style={{color: '#ff3333', fontWeight: 'bold'}}>LOCK VAULT</Text></TouchableOpacity>
              </>
            )}
            {menuView === 'identity' && (
              <>
                <Text style={styles.menuHeader}>SELECT DECOY IDENTITY</Text>
                {['Notes', 'Calculator', 'Weather', 'Finance'].map(id => (
                  <TouchableOpacity key={id} style={styles.actionBtn} onPress={() => {setAppIdentity(id); setMainMenuVisible(false);}}><Text style={styles.actionText}>{id} Mode {appIdentity === id && '✓'}</Text></TouchableOpacity>
                ))}
                <TouchableOpacity style={{marginTop: 15}} onPress={() => setMenuView('main')}><Text style={{color: '#888'}}>← Back</Text></TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={profileModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.profileCard}>
            <TouchableOpacity style={styles.closeBtnAbsolute} onPress={() => setProfileModalVisible(false)}><Text style={{color: '#ff3333', fontSize: 20, fontWeight: 'bold'}}>X</Text></TouchableOpacity>
            {selectedProfile?.dp ? <Image source={{uri: selectedProfile.dp}} style={styles.largeDP} /> : <View style={styles.largeDP}><Text style={{color: '#39FF14', fontSize: 40}}>{selectedProfile?.name?.[0]}</Text></View>}
            <Text style={{color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 15}}>@{selectedProfile?.name}</Text>
            {isEditingBio ? (
              <View style={{width: '100%', alignItems: 'center', marginTop: 10}}>
                <TextInput style={{backgroundColor: '#000', color: '#39FF14', width: '100%', padding: 10, borderWidth: 1, borderColor: '#39FF14', borderRadius: 5}} value={bioInput} onChangeText={setBioInput} autoFocus />
                <TouchableOpacity onPress={saveBio} style={{marginTop: 10, backgroundColor: '#111', padding: 10, borderRadius: 5}}><Text style={{color: '#39FF14'}}>Save Bio</Text></TouchableOpacity>
              </View>
            ) : (
              <Text style={{color: '#888', marginTop: 10, textAlign: 'center'}}>{selectedProfile?.bio || 'No bio set.'}</Text>
            )}
            <View style={{marginTop: 30, width: '100%'}}>
              {selectedProfile?.phone === currentUser?.phone ? (
                <>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => pickImage('dp')}><Text style={styles.actionText}>Upload DP</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={removeDP}><Text style={styles.actionText}>Remove DP</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setIsEditingBio(true)}><Text style={styles.actionText}>Edit Bio</Text></TouchableOpacity>
                </>
              ) : (
                <>
                  {!friendsList.find(f => f.phone === selectedProfile?.phone) ? (
                    <TouchableOpacity style={styles.actionBtn} onPress={sendFriendRequest}><Text style={styles.actionText}>Send Friend Request</Text></TouchableOpacity>
                  ) : (
                    <>
                      <Text style={{color: '#39FF14', textAlign: 'center', fontWeight: 'bold', marginBottom: 15}}>✔ Network Connected</Text>
                      <TouchableOpacity style={[styles.actionBtn, {borderColor: '#ff3333'}]} onPress={() => removeFriend(selectedProfile.phone)}><Text style={{color: '#ff3333', fontWeight: 'bold'}}>Remove Friend</Text></TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  decoyContainer: { flex: 1, backgroundColor: '#fff', paddingTop: 50 },
  decoyHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderColor: '#eee' },
  decoyTitle: { fontSize: 20, fontWeight: 'bold' },
  decoyDot: { fontSize: 24, color: '#888' },
  decoyInput: { flex: 1, padding: 20, fontSize: 18, textAlignVertical: 'top' },
  calcContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  calcDisplay: { color: '#fff', fontSize: 80, textAlign: 'right', padding: 20 },
  calcPad: { paddingBottom: 30, paddingHorizontal: 10 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  calcBtn: { width: 75, height: 75, borderRadius: 40, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  calcBtnOp: { backgroundColor: '#FF9500' },
  calcBtnText: { color: '#fff', fontSize: 30 },
  authContainer: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', padding: 30 },
  authTitle: { color: '#39FF14', fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  authToggle: { flexDirection: 'row', marginBottom: 30, backgroundColor: '#111', borderRadius: 10, padding: 5 },
  authTab: { flex: 1, padding: 15, alignItems: 'center', borderRadius: 8 },
  authTabActive: { backgroundColor: '#39FF14' },
  authInput: { backgroundColor: '#111', color: '#39FF14', padding: 18, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#222' },
  authBtn: { backgroundColor: '#39FF14', padding: 20, borderRadius: 10, alignItems: 'center' },
  vaultContainer: { flex: 1, backgroundColor: '#000', paddingTop: 50 },
  notificationBar: { backgroundColor: '#39FF14', padding: 15, marginHorizontal: 15, borderRadius: 10, marginBottom: 10 },
  vaultHeader: { flexDirection: 'row', alignItems: 'center', padding: 15 },
  vaultSearch: { flex: 1, backgroundColor: '#111', height: 40, borderRadius: 20, paddingHorizontal: 20, color: '#39FF14' },
  profileBar: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: '#111' },
  miniDP: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: '#39FF14', marginRight: 15, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  storyContainer: { borderBottomWidth: 1, borderColor: '#111', paddingVertical: 15 },
  storyItem: { alignItems: 'center', marginLeft: 15 },
  storyCircle: { width: 60, height: 60, borderRadius: 30, borderColor: '#39FF14', borderWidth: 2, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111', overflow: 'hidden' },
  storyText: { color: '#fff', fontSize: 10, marginTop: 5 },
  chatItem: { flexDirection: 'row', padding: 20, alignItems: 'center' },
  chatIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  chatRoomHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#39FF14', backgroundColor: '#111' },
  chatHeaderDP: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  msgBubble: { alignSelf: 'flex-start', padding: 10, borderRadius: 15, marginBottom: 10, maxWidth: '80%' },
  msgBubbleMe: { alignSelf: 'flex-end', padding: 10, borderRadius: 15, marginBottom: 10, maxWidth: '80%' },
  attachMenu: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#111', padding: 15, borderTopWidth: 1, borderColor: '#39FF14' },
  attachIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#222', width: 80 },
  chatInputArea: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#39FF14', backgroundColor: '#111', alignItems: 'center' },
  chatRoomInput: { flex: 1, borderWidth: 1, borderColor: '#39FF14', color: '#39FF14', borderRadius: 25, paddingHorizontal: 20, height: 45, marginRight: 10 },
  chatSendBtn: { justifyContent: 'center', paddingHorizontal: 20, height: 45, borderRadius: 25, backgroundColor: '#39FF14' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  profileCard: { width: '85%', backgroundColor: '#111', borderRadius: 20, padding: 25, alignItems: 'center', borderWidth: 1, borderColor: '#39FF14', position: 'relative' },
  closeBtnAbsolute: { position: 'absolute', top: 15, right: 20, zIndex: 10 },
  largeDP: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#000', borderWidth: 2, borderColor: '#39FF14', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  actionBtn: { width: '100%', padding: 15, borderWidth: 1, borderColor: '#39FF14', borderRadius: 10, marginBottom: 10, alignItems: 'center' },
  actionText: { color: '#39FF14', fontWeight: 'bold' },
  menuHeader: { color: '#888', fontSize: 12, marginBottom: 15, letterSpacing: 2 }
});