import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// 🛑 Web-Safe Test Mode (No Firebase)

export default function App() {
  const [screen, setScreen] = useState('notes'); 
  const [notesText, setNotesText] = useState('');
  const [calcInput, setCalcInput] = useState('0'); // Real calculators start at 0
  const [secretPin, setSecretPin] = useState<string | null>(null);
  
  const [terminalID, setTerminalID] = useState('');
  const [codeName, setCodeName] = useState('');
  const [password, setPassword] = useState('');
  
  const [messages, setMessages] = useState<any[]>([
    { id: '1', uid: '999', name: 'Ghost', data: 'The realistic UI looks amazing!', type: 'text' },
  ]);
  const [messageInput, setMessageInput] = useState('');

  useEffect(() => {
    const loadSetup = async () => {
      const pin = await AsyncStorage.getItem('apexSecretPin');
      if (pin) setSecretPin(pin);
    };
    loadSetup();
  }, []);

  const handleNotesChange = (text: string) => {
    setNotesText(text);
    if (text.toLowerCase().includes('sourabh')) {
      if (!secretPin) {
        const tempPin = '1234'; 
        AsyncStorage.setItem('apexSecretPin', tempPin);
        setSecretPin(tempPin);
        setNotesText('');
        alert("Web Test: PIN automatically set to 1234. Type sourabh again.");
      } else {
        setScreen('calc');
        setNotesText('');
        setCalcInput('0');
      }
    }
  };

  const handleCalcPress = (val: string) => {
    let newVal = calcInput === '0' ? val : calcInput + val;
    if (val === 'C') newVal = '0';
    setCalcInput(newVal);
    
    if (secretPin && newVal.includes(secretPin)) {
      setCalcInput('0');
      setScreen(terminalID ? 'chat' : 'auth');
    }
  };

  const handleAuth = async () => {
    if (!terminalID) return alert("Enter any Phone ID to test");
    setScreen('chat');
  };

  const handleLogout = () => {
    setTerminalID('');
    setScreen('notes');
  };

  const sendMessage = () => {
    if (!messageInput.trim()) return;
    const newMsg = { id: Math.random().toString(), uid: terminalID, name: codeName || 'Me', data: messageInput, type: 'text' };
    setMessages([newMsg, ...messages]);
    setMessageInput('');
  };

  // ==========================================
  // HYPER-REALISTIC UI RENDERING
  // ==========================================

  if (screen === 'notes') {
    return (
      <View style={styles.notesContainer}>
        {/* Fake Top Navigation Bar */}
        <View style={styles.notesNav}>
          <Text style={styles.notesNavIcon}>←</Text>
          <Text style={styles.notesNavIcon}>⋮</Text>
        </View>
        <Text style={styles.notesDate}>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
        <TextInput style={styles.notesTitle} placeholder="Title" placeholderTextColor="#666" />
        <TextInput 
          style={styles.notesInput}
          multiline
          placeholder="Note"
          placeholderTextColor="#666"
          value={notesText}
          onChangeText={handleNotesChange}
        />
      </View>
    );
  }

  if (screen === 'calc') {
    const rows = [
      ['C', '+/-', '%', '÷'],
      ['7', '8', '9', '×'],
      ['4', '5', '6', '-'],
      ['1', '2', '3', '+'],
      ['0', '.', '=']
    ];
    return (
      <View style={styles.calcContainer}>
        <Text style={styles.calcDisplay} numberOfLines={1} adjustsFontSizeToFit>{calcInput}</Text>
        <View style={styles.calcPad}>
          {rows.map((row, rIdx) => (
            <View key={rIdx} style={styles.calcRow}>
              {row.map(k => {
                const isOp = ['÷','×','-','+','='].includes(k);
                const isTop = ['C','+/-','%'].includes(k);
                const isZero = k === '0';
                return (
                  <TouchableOpacity 
                    key={k} 
                    style={[
                      styles.calcBtn, 
                      isOp ? styles.calcBtnOp : isTop ? styles.calcBtnTop : null,
                      isZero ? { width: '46%', alignItems: 'flex-start', paddingLeft: 30 } : null
                    ]} 
                    onPress={() => handleCalcPress(k)}
                  >
                    <Text style={[styles.calcBtnText, isTop ? {color: '#000'} : null]}>{k}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (screen === 'auth') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.authHeader}>APEX PRO</Text>
        <TextInput style={styles.input} placeholder="Phone ID" placeholderTextColor="#666" value={terminalID} onChangeText={setTerminalID} />
        <TextInput style={styles.input} placeholder="Code Name" placeholderTextColor="#666" value={codeName} onChangeText={setCodeName} />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#666" secureTextEntry />
        <TouchableOpacity style={styles.btnMain} onPress={handleAuth}><Text style={styles.btnText}>ENTER VAULT</Text></TouchableOpacity>
      </View>
    );
  }

  if (screen === 'chat') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.chatContainer}>
        <View style={styles.chatHeader}>
          <Text style={styles.headerText}>Global Chat</Text>
          <TouchableOpacity onPress={handleLogout}><Text style={{color: '#ff3333'}}>Lock</Text></TouchableOpacity>
        </View>
        <FlatList 
          data={messages} keyExtractor={item => item.id} inverted
          renderItem={({item}) => {
            const isMe = item.uid === terminalID;
            return (
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                {!isMe && <Text style={styles.senderName}>{item.name}</Text>}
                <Text style={styles.msgText}>{item.data}</Text>
              </View>
            )
          }}
        />
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.attachBtn}><Text style={{color: '#39FF14'}}>➕</Text></TouchableOpacity>
          <TextInput style={styles.chatInput} placeholder="Message..." placeholderTextColor="#666" value={messageInput} onChangeText={setMessageInput} />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}><Text style={{color: '#000', fontWeight: 'bold'}}>Send</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }
}

// ==========================================
// REALISTIC STYLES
// ==========================================
const styles = StyleSheet.create({
  // Notes App
  notesContainer: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 50 },
  notesNav: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  notesNavIcon: { color: '#E0E0E0', fontSize: 28 },
  notesDate: { color: '#888', fontSize: 14, marginBottom: 15 },
  notesTitle: { color: '#FFF', fontSize: 32, fontWeight: 'bold', marginBottom: 10 },
  notesInput: { flex: 1, color: '#E0E0E0', fontSize: 20, textAlignVertical: 'top' },
  
  // iOS/Android Hybrid Calculator
  calcContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  calcDisplay: { color: '#fff', fontSize: 90, textAlign: 'right', padding: 30, fontWeight: '300' },
  calcPad: { paddingBottom: 40, paddingHorizontal: 10 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  calcBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  calcBtnOp: { backgroundColor: '#FF9500' },
  calcBtnTop: { backgroundColor: '#A5A5A5' },
  calcBtnText: { color: '#fff', fontSize: 36, fontWeight: '400' },

  // Auth & Chat (Kept dark and hacker-themed)
  authContainer: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', padding: 40 },
  authHeader: { color: '#39FF14', fontSize: 32, textAlign: 'center', letterSpacing: 5, marginBottom: 40 },
  input: { backgroundColor: '#111', color: '#39FF14', padding: 20, fontSize: 18, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  btnMain: { backgroundColor: '#39FF14', padding: 20, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 18 },

  chatContainer: { flex: 1, backgroundColor: '#050505' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 50, backgroundColor: '#111', borderBottomWidth: 1, borderColor: '#39FF14' },
  headerText: { color: '#39FF14', fontWeight: 'bold', fontSize: 20 },
  bubble: { maxWidth: '80%', padding: 15, borderRadius: 20, marginVertical: 5, marginHorizontal: 15 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#111', borderWidth: 1, borderColor: '#39FF14', borderBottomRightRadius: 5 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#222', borderBottomLeftRadius: 5 },
  senderName: { color: '#888', fontSize: 12, marginBottom: 5 },
  msgText: { color: '#39FF14', fontSize: 16 },
  toolbar: { flexDirection: 'row', padding: 15, backgroundColor: '#111', alignItems: 'center', paddingBottom: 30 },
  attachBtn: { paddingHorizontal: 15 },
  chatInput: { flex: 1, color: '#39FF14', fontSize: 16, borderWidth: 1, borderColor: '#39FF14', borderRadius: 25, paddingHorizontal: 20, height: 45 },
  sendBtn: { backgroundColor: '#39FF14', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 25, marginLeft: 10, height: 45 }
});