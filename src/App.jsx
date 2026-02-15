import React, { useState, useEffect, useRef } from 'react';
import { 
  Trash2, Sparkles, Wallet, Users, CheckCircle2, AlertCircle, Clock, 
  DollarSign, Plus, ArrowRight, UserCircle2, MoreVertical, History, 
  MessageCircle, Settings, Edit2, Save, X, Play, CalendarDays, 
  AlertTriangle, UserPlus, Palette, List, ChevronLeft, ChevronRight, 
  User, Calendar, ChevronDown, ChevronUp, ClipboardList, Check, Loader2,
  LogOut
} from 'lucide-react';

// ==========================================
// ⚠️【部署前重要步驟】⚠️
// 請在您的 VS Code 中，將下方被註解的 import 取消註解 (移除 //)
// 並確保已執行: npm install firebase @line/liff
// ==========================================

// --- 預覽環境專用模擬 (部署時可保留或刪除，不影響) ---
// 為了防止預覽環境報錯 ReferenceError，我們定義這些空函式
const liff = typeof window !== 'undefined' && window.liff ? window.liff : {
  isInClient: () => false,
  init: () => Promise.resolve(),
  isLoggedIn: () => true,
  getProfile: () => Promise.resolve({ displayName: "預覽測試", userId: "u1" }),
  sendMessages: () => Promise.resolve(),
  getContext: () => ({ groupId: "demo-room" })
};
const initializeApp = () => ({});
const getFirestore = () => null;
const doc = () => ({});
const setDoc = () => Promise.resolve();
const onSnapshot = () => () => {};
const updateDoc = () => Promise.resolve();
const arrayUnion = () => {};
const getDoc = () => Promise.resolve({ exists: () => false });

// ==========================================
// ⚙️ 系統設定區 (請填入真實資料)
// ==========================================

const ENABLE_FIREBASE = true; 
const LIFF_ID = "2009134573-7SuphV8b"; 

const firebaseConfig = {
  apiKey: "AIzaSyBBiEaI_-oH34YLpB4xmlJljyOtxz-yty4",
  authDomain: "roomie-task.firebaseapp.com",
  projectId: "roomie-task",
  storageBucket: "roomie-task.firebasestorage.app",
  messagingSenderId: "233849609695",
  appId: "1:233849609695:web:0c76a4b9b40070cf22386a"
};

// 檢查 Config 是否已填寫 (防呆用)
const isConfigConfigured = firebaseConfig.apiKey !== "AIzaSyBBiEaI_-oH34YLpB4xmlJljyOtxz-yty4";

// ==========================================
// 🛠️ 初始化 Firebase
// ==========================================
let db;
// 只有在設定正確且非預覽環境才初始化
if (ENABLE_FIREBASE && isConfigConfigured && typeof window !== 'undefined' && !window.liff) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase Init Error:", e);
  }
}

// ==========================================
// 📅 工具函式
// ==========================================
const getTodayString = () => new Date().toISOString().split('T')[0];
const getFutureDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};
const isFutureDate = (dateStr) => dateStr > getTodayString();
const formatDate = (dateObj) => `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
const getIntervalDays = (freqString) => {
  const match = freqString.match(/每 (\d+) 天/);
  return match ? parseInt(match[1], 10) : 7;
};

// 預設的家務設定 (新群組建立時使用)
const DEFAULT_TASK_CONFIG = [
  { id: 't1', name: '倒垃圾', price: 30, freq: '每 7 天', icon: '🗑️', defaultAssigneeId: '', nextDate: getTodayString() },
  { id: 't2', name: '掃廁所', price: 80, freq: '每 14 天', icon: '🚽', defaultAssigneeId: '', nextDate: getFutureDate(2) },
];

const AVATAR_COLORS = ['bg-blue-400', 'bg-emerald-400', 'bg-rose-400', 'bg-amber-400', 'bg-violet-400', 'bg-red-400', 'bg-[#28C8C8]', 'bg-orange-400'];

// ==========================================
// 📱 主應用程式
// ==========================================
export default function RoomieTaskApp() {
  // --- 核心狀態 ---
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  // 身分狀態
  const [roomId, setRoomId] = useState(null); // 群組 ID (檔案名稱)
  const [myProfile, setMyProfile] = useState(null); // 當前使用者的 LINE Profile
  
  // 資料庫狀態 (從 Firebase 同步)
  const [roomData, setRoomData] = useState({
    users: [],
    taskConfigs: DEFAULT_TASK_CONFIG,
    currentCycleTasks: [],
    logs: []
  });

  // UI 狀態
  const [view, setView] = useState('roster'); 
  const [rosterViewMode, setRosterViewMode] = useState('list'); 
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(getTodayString());
  const [calendarMonth, setCalendarMonth] = useState(new Date()); 
  
  // Lists UI
  const [visibleMyTasksCount, setVisibleMyTasksCount] = useState(3);
  const [visibleAllTasksCount, setVisibleAllTasksCount] = useState(3);
  const [isMyTasksOpen, setIsMyTasksOpen] = useState(true);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);

  // Forms & Modals
  const [isEditingTask, setIsEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', price: '', freq: '每 7 天', icon: '🧹', defaultAssigneeId: '', nextDate: getTodayString() });
  const [customDays, setCustomDays] = useState(7);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', avatar: 'bg-blue-400' });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: () => {} });

  // 解構資料方便使用
  const { users, taskConfigs, currentCycleTasks, logs } = roomData;
  // 找出「我」在資料庫裡的完整資料 (包含餘額)
  const myUserData = users.find(u => u.id === myProfile?.userId);

  // ==========================================
  // 🔗 初始化流程 (LIFF + Firebase)
  // ==========================================
  useEffect(() => {
    // 設置 Timeout 防止 Loading 卡住
    const timeoutId = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn("連線逾時或未設定 Firebase，切換至離線/預覽模式");
          return false;
        }
        return prev;
      });
    }, 2000);

    const initialize = async () => {
      try {
        let currentRoomId = "demo-room-001"; // 預設測試房
        let currentUser = { userId: "user_me", displayName: "我(測試)", pictureUrl: "" };

        // 1. 嘗試初始化 LIFF
        if (LIFF_ID && LIFF_ID !== "YOUR_LIFF_ID_HERE") {
          try {
            await liff.init({ liffId: LIFF_ID });
            if (!liff.isLoggedIn()) {
              // 預覽環境不自動跳轉登入，以免卡住
              if (!window.location.hostname.includes('webcontainer')) {
                liff.login();
                return;
              }
            }
            
            // 取得 Profile
            const profile = await liff.getProfile();
            currentUser = profile;

            // 取得 Context (群組 ID)
            const context = liff.getContext();
            if (context?.groupId) currentRoomId = context.groupId;
            else if (context?.utouId) currentRoomId = context.utouId;
            // 如果是一對一聊天或外部瀏覽器，就用 userId 當作私人房間
            else if (context?.userId) currentRoomId = `private-${context.userId}`;
            
          } catch (e) {
            console.error("LIFF Init Error:", e);
            // 保持在測試模式
          }
        }

        setRoomId(currentRoomId);
        setMyProfile(currentUser);

        // 2. 連接資料庫並監聽
        if (ENABLE_FIREBASE && db && isConfigConfigured) {
          const roomRef = doc(db, "rooms", currentRoomId);
          
          const unsubscribe = onSnapshot(roomRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              
              // 3. 自動註冊邏輯 (Auto-Join)
              // 檢查當前使用者是否在 users 陣列中
              const isUserExist = data.users?.some(u => u.id === currentUser.userId);
              
              if (!isUserExist) {
                // 如果是新用戶，自動加入
                const newUser = {
                  id: currentUser.userId,
                  name: currentUser.displayName,
                  avatar: 'bg-blue-400', // 預設顏色
                  pictureUrl: currentUser.pictureUrl, // 存 LINE 頭貼
                  balance: 0,
                  joinedAt: new Date().toISOString()
                };
                
                // 寫入資料庫
                updateDoc(roomRef, {
                  users: arrayUnion(newUser)
                });
                
                // 本地先更新 (讓 UI 不要閃爍)
                setRoomData(prev => ({ ...prev, users: [...(prev.users || []), newUser] }));
              } else {
                setRoomData(data);
              }
            } else {
              // 4. 新群組初始化 (Create Room)
              const initialUser = {
                id: currentUser.userId,
                name: currentUser.displayName,
                avatar: 'bg-blue-400',
                balance: 0,
                joinedAt: new Date().toISOString()
              };
              
              const newRoomData = {
                users: [initialUser],
                taskConfigs: DEFAULT_TASK_CONFIG,
                currentCycleTasks: [],
                logs: [{ id: Date.now(), msg: `🏠 群組「${currentRoomId.slice(0,6)}...」建立成功！`, type: 'info', time: new Date().toLocaleTimeString() }]
              };
              
              setDoc(roomRef, newRoomData);
              setRoomData(newRoomData);
            }
            setLoading(false);
          }, (err) => {
            console.error("DB Error:", err);
            setErrorMsg("資料庫連線失敗，請檢查網路或權限");
            setLoading(false);
          });
          
          return () => unsubscribe();
        } else {
          // 單機預覽模式 (無資料庫)
          // 產生一些假資料方便預覽 UI
          setRoomData(prev => ({
             ...prev, 
             users: [
               { id: 'user_me', name: '我(測試)', balance: 0, avatar: 'bg-blue-400' },
               { id: 'u2', name: '室友A', balance: 50, avatar: 'bg-emerald-400' }
             ]
          }));
          // 若無任務，自動產生一次
          if (currentCycleTasks.length === 0) {
            // 注意：這裡不能直接呼叫 dispatchTasksFromConfig 因為依賴 state，
            // 預覽模式下我們依賴 dispatchTasksFromConfig 內部的 manualTrigger=true 邏輯
          }
          setLoading(false);
        }

      } catch (err) {
        console.error("Init Error:", err);
        setLoading(false);
      }
    };

    initialize();
    return () => clearTimeout(timeoutId);
  }, []);
  
  // 預覽模式補丁：如果是單機預覽且無任務，自動產生
  useEffect(() => {
    if (!loading && !isConfigConfigured && roomData.users.length > 0 && roomData.currentCycleTasks.length === 0) {
      dispatchTasksFromConfig(true);
    }
  }, [loading]);


  // ==========================================
  // 💾 資料庫操作封裝
  // ==========================================

  const updateDB = async (newData) => {
    // 1. 本地樂觀更新
    setRoomData(prev => ({ ...prev, ...newData }));

    // 2. 雲端寫入
    if (ENABLE_FIREBASE && db && roomId && isConfigConfigured) {
      try {
        const roomRef = doc(db, "rooms", roomId);
        await updateDoc(roomRef, newData);
      } catch (e) {
        console.error("Sync Error:", e);
      }
    }
  };

  const addLog = (msg, type = 'info') => {
    const newLog = { id: Date.now(), msg, type, time: new Date().toLocaleTimeString() };
    const newLogs = [newLog, ...logs].slice(0, 50);
    return newLogs;
  };

  // ==========================================
  // 🕹️ 業務邏輯 (Business Logic)
  // ==========================================

  // ... (其餘邏輯與之前相同，只是變數名稱從 data 變成 roomData) ...
  
  // 為了簡潔，這裡僅列出關鍵修改的 function，其餘 CRUD 邏輯保持原樣但使用 updateDB

  const dispatchTasksFromConfig = (manualTrigger = false) => {
    if (users.length === 0) return;
    
    const generatedTasks = [];
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 45);

    taskConfigs.forEach((config) => {
      const interval = getIntervalDays(config.freq);
      let currentDate = new Date(config.nextDate || getTodayString()); 
      
      let assigneeIndex = users.findIndex(u => u.id === config.defaultAssigneeId);
      if (assigneeIndex === -1) assigneeIndex = 0;

      let occurrenceCount = 0;

      while (currentDate <= limitDate) {
        const assignee = users[(assigneeIndex + occurrenceCount) % users.length];
        generatedTasks.push({
          id: `cycle-${config.id}-${formatDate(currentDate)}`, 
          configId: config.id,
          assigneeId: assignee.id, 
          currentHolderId: assignee.id, 
          status: 'pending', 
          price: config.price,
          name: config.name,
          icon: config.icon,
          freq: config.freq,
          date: formatDate(currentDate)
        });
        currentDate.setDate(currentDate.getDate() + interval);
        occurrenceCount++;
      }
    });

    generatedTasks.sort((a, b) => a.date.localeCompare(b.date));
    
    updateDB({
      currentCycleTasks: generatedTasks,
      logs: manualTrigger ? addLog('🔄 值日生表已重新產生', 'info') : logs
    });
    if (manualTrigger) setView('roster');
  };

  // --- 其他 CRUD 與 Helper (略作調整以適應 roomData) ---
  const saveTaskConfig = () => {
    if (!editForm.name || editForm.price === '' || Number(editForm.price) < 0 || !editForm.nextDate) return;
    const price = Number(editForm.price);
    const finalFreq = `每 ${customDays} 天`;
    const newConfig = { ...editForm, price, freq: finalFreq };
    
    let newTaskConfigs;
    if (isEditingTask) {
      newTaskConfigs = taskConfigs.map(t => t.id === isEditingTask ? { ...t, ...newConfig } : t);
    } else {
      newTaskConfigs = [...taskConfigs, { id: `t${Date.now()}`, ...newConfig }];
    }
    updateDB({ taskConfigs: newTaskConfigs });
    closeEditor();
  };

  const confirmDeleteTaskConfig = (id) => {
    showConfirm('刪除家務規則', '確定要刪除嗎？這會清除相關排班。', () => {
      const newTaskConfigs = taskConfigs.filter(t => t.id !== id);
      const newCycleTasks = currentCycleTasks.filter(t => t.configId !== id);
      updateDB({ taskConfigs: newTaskConfigs, currentCycleTasks: newCycleTasks });
      closeConfirmModal();
    });
  };

  // 新增室友 (現在主要用於幫沒加入的人手動建檔)
  const saveUser = () => {
    if (!userForm.name.trim()) return;
    const newUser = { id: `u${Date.now()}`, name: userForm.name, avatar: userForm.avatar, balance: 0 };
    updateDB({ 
      users: [...users, newUser],
      logs: addLog(`👋 手動新增室友 ${newUser.name}`, 'success') 
    });
    setIsAddingUser(false);
    setUserForm({ name: '', avatar: 'bg-blue-400' });
  };

  const confirmDeleteUser = (userId) => {
    const userToDelete = users.find(u => u.id === userId);
    if (userToDelete.balance !== 0) {
      showAlert('無法刪除', `請先結清 ${userToDelete.name} 的款項。`);
      return;
    }
    showConfirm('刪除室友', `確定要刪除 ${userToDelete.name} 嗎？`, () => {
      const newUsers = users.filter(u => u.id !== userId);
      const newCycleTasks = currentCycleTasks.map(t => t.currentHolderId === userId ? { ...t, status: 'open', currentHolderId: null } : t);
      updateDB({ users: newUsers, currentCycleTasks: newCycleTasks });
      closeConfirmModal();
    });
  };

  const completeTask = (taskId) => {
    const task = currentCycleTasks.find(t => t.id === taskId);
    const newCycleTasks = currentCycleTasks.map(t => t.id === taskId ? { ...t, status: 'done' } : t);
    updateDB({
      currentCycleTasks: newCycleTasks,
      logs: addLog(`✅ ${myUserData?.name || '有人'} 完成了 ${task.name}`, 'success')
    });
  };

  const releaseTask = (taskId) => {
    const task = currentCycleTasks.find(t => t.id === taskId);
    const newUsers = users.map(u => u.id === task.currentHolderId ? { ...u, balance: u.balance - task.price } : u);
    const newCycleTasks = currentCycleTasks.map(t => t.id === taskId ? { ...t, status: 'open' } : t);
    
    updateDB({
      users: newUsers,
      currentCycleTasks: newCycleTasks,
      logs: addLog(`💸 ${getUserName(task.currentHolderId)} 釋出了 ${task.name}`, 'warning')
    });
  };

  const claimBounty = (taskId) => {
    const task = currentCycleTasks.find(t => t.id === taskId);
    const newUsers = users.map(u => u.id === myUserData.id ? { ...u, balance: u.balance + task.price } : u);
    const newCycleTasks = currentCycleTasks.map(t => t.id === taskId ? { ...t, status: 'pending', currentHolderId: myUserData.id } : t);
    updateDB({
      users: newUsers,
      currentCycleTasks: newCycleTasks,
      logs: addLog(`💰 ${myUserData?.name} 接手了 ${task.name}`, 'success')
    });
  };

  const executeSettlement = (fromId, toId, amount) => {
    const fromUser = users.find(u => u.id === fromId);
    const toUser = users.find(u => u.id === toId);
    showConfirm('確認還款', `確定 ${fromUser.name} 已支付 $${amount} 給 ${toUser.name}？`, () => {
      const newUsers = users.map(u => {
        if (u.id === fromId) return { ...u, balance: u.balance + amount };
        if (u.id === toId) return { ...u, balance: u.balance - amount };
        return u;
      });
      updateDB({
        users: newUsers,
        logs: addLog(`💸 ${fromUser.name} 還清了欠款`, 'success')
      });
      closeConfirmModal();
    });
  };

  // --- Helpers ---
  const getUserName = (id) => users.find(u => u.id === id)?.name || '未知';
  const getUserAvatar = (id) => users.find(u => u.id === id)?.avatar || 'bg-gray-300';
  const showConfirm = (title, message, onConfirm) => setConfirmModal({ isOpen: true, title, message, type: 'confirm', onConfirm });
  const showAlert = (title, message) => setConfirmModal({ isOpen: true, title, message, type: 'alert', onConfirm: () => {} });
  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));
  const openEditor = (task = null) => {
    setIsEditingTask(task ? task.id : null);
    // 預設負責人改為當前用戶，若無則為空
    const defaultUser = myUserData ? myUserData.id : (users.length > 0 ? users[0].id : '');
    
    if (task) {
      setCustomDays(getIntervalDays(task.freq));
      setEditForm({ name: task.name, price: task.price, freq: task.freq, icon: task.icon, defaultAssigneeId: task.defaultAssigneeId || defaultUser, nextDate: task.nextDate || getTodayString() });
    } else {
      setCustomDays(7); 
      setEditForm({ name: '', price: '', freq: '每 7 天', icon: '🧹', defaultAssigneeId: defaultUser, nextDate: getTodayString() });
    }
    setView('settings_editor');
  };
  const closeEditor = () => { setIsEditingTask(null); setView('settings'); };
  const isFormValid = editForm.name.trim() !== '' && editForm.price !== '' && Number(editForm.price) >= 0 && editForm.nextDate && customDays > 0;
  
  // Settlement Logic
  const calculateSettlements = () => {
    let debtors = users.filter(u => u.balance < 0).map(u => ({...u})).sort((a, b) => a.balance - b.balance);
    let creditors = users.filter(u => u.balance > 0).map(u => ({...u})).sort((a, b) => b.balance - a.balance);
    const settlements = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      let debtor = debtors[i];
      let creditor = creditors[j];
      let amount = Math.min(Math.abs(debtor.balance), creditor.balance);
      if (amount > 0) {
        settlements.push({ fromId: debtor.id, fromName: debtor.name, toId: creditor.id, toName: creditor.name, amount: amount });
      }
      debtor.balance += amount;
      creditor.balance -= amount;
      if (Math.abs(debtor.balance) < 0.01) i++;
      if (creditor.balance < 0.01) j++;
    }
    return settlements;
  };
  
  const changeMonth = (delta) => {
    const newDate = new Date(calendarMonth);
    newDate.setMonth(newDate.getMonth() + delta);
    setCalendarMonth(newDate);
  };
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay(); 

  const TabButton = ({ id, label, icon: Icon }) => (
    <button onClick={() => setView(id)} className={`flex flex-col items-center justify-center w-full py-3 transition-colors ${view === id || (view.startsWith(id)) ? 'text-[#28C8C8]' : 'text-gray-400'}`}>
      <Icon size={24} />
      <span className="text-xs mt-1 font-medium">{label}</span>
    </button>
  );

  const LoadMoreButton = ({ onClick }) => (
    <div className="p-2 text-center border-t border-gray-50">
      <button onClick={onClick} className="text-xs text-[#28C8C8] hover:text-[#20a0a0] font-medium flex items-center justify-center gap-1 w-full py-2 hover:bg-[#28C8C8]/5 rounded transition-colors"><ChevronDown size={14} /> 顯示更多</button>
    </div>
  );

  if (loading) return <div className="fixed inset-0 flex items-center justify-center bg-gray-50"><Loader2 className="w-10 h-10 text-[#28C8C8] animate-spin mb-4" /></div>;

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 font-sans max-w-md mx-auto border-x border-gray-200 shadow-2xl overflow-hidden h-[100dvh]">
      
      {/* Modal */}
      {confirmModal.isOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all scale-100">
            <h3 className="text-xl font-bold text-gray-800 mb-2">{confirmModal.title}</h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">{confirmModal.message}</p>
            <div className="flex gap-3">
              {confirmModal.type === 'confirm' ? (
                <>
                  <button onClick={closeConfirmModal} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors">取消</button>
                  <button onClick={confirmModal.onConfirm} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 transition-colors">確認</button>
                </>
              ) : (
                <button onClick={closeConfirmModal} className="flex-1 py-3 bg-[#28C8C8] hover:bg-[#20a0a0] text-white rounded-xl font-bold transition-colors">知道了</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none bg-white px-4 py-4 border-b flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          {/* Status Indicator */}
          {isConnected ? (
             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="已連線"></div>
          ) : (
             <div className="w-2 h-2 rounded-full bg-red-500" title="未連線"></div>
          )}
          <div><h1 className="font-bold text-gray-800 text-lg leading-tight">家事值日生</h1></div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">我是</span>
          <div className="flex items-center gap-2 bg-gray-100 rounded-full px-2 py-1.5 cursor-pointer hover:bg-gray-200 border border-gray-200 relative transition-colors">
            {myUserData ? (
              <>
                <div className={`w-6 h-6 rounded-full ${myUserData.avatar} flex-shrink-0 border border-gray-200`}></div>
                <div className="relative">
                  {/* 使用 myUserData.id 作為 value */}
                  <span className="text-sm font-bold text-gray-700 pr-2">{myUserData.name}</span>
                </div>
              </>
            ) : (
               <span className="text-sm font-bold text-gray-400">載入中...</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6 w-full relative [scrollbar-gutter:stable]">

        {/* VIEW: ROSTER */}
        {view === 'roster' && (
          <div className="space-y-4">
            
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setRosterViewMode('list')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><List size={16} /> 清單模式</button>
              <button onClick={() => setRosterViewMode('calendar')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><CalendarDays size={16} /> 日曆模式</button>
            </div>

            {/* 我的待辦 */}
            {rosterViewMode === 'list' && (
              <div>
                <div className="flex justify-between items-end mb-3 cursor-pointer group" onClick={() => setIsMyTasksOpen(!isMyTasksOpen)}>
                  <h3 className="font-bold text-gray-700 flex items-center gap-2 group-hover:text-[#28C8C8] transition-colors"><CheckCircle2 size={18} className="text-gray-400 group-hover:text-[#28C8C8] transition-colors" /> 我的待辦 {isMyTasksOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}</h3>
                  <span className="text-xs text-gray-400">今日事項優先</span>
                </div>
                {isMyTasksOpen && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in mb-6">
                    {(() => {
                      const myTasks = currentCycleTasks.filter(t => t.currentHolderId === myProfile?.userId && t.status === 'pending');
                      if (myTasks.length === 0) return <div className="p-6 text-center text-gray-400 text-sm">目前沒有待辦事項 🎉</div>;
                      const displayedTasks = myTasks.slice(0, visibleMyTasksCount);
                      return (
                        <>
                          <div className="divide-y divide-gray-50">
                            {displayedTasks.map(task => {
                              const isTaskFuture = isFutureDate(task.date);
                              return (
                                <div key={task.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-[#28C8C8]/10 rounded-full flex items-center justify-center text-xl shrink-0">{task.icon}</div>
                                    <div>
                                      <h4 className="font-bold text-gray-800">{task.name}</h4>
                                      <span className={`text-xs px-1.5 rounded font-mono mt-1 inline-block ${task.date === getTodayString() ? 'bg-red-100 text-red-500 font-bold' : 'bg-gray-100 text-gray-500'}`}>{task.date === getTodayString() ? '今天' : task.date}</span>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                     <button onClick={() => releaseTask(task.id)} className="w-16 h-9 rounded-lg text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors flex justify-center items-center">沒空</button>
                                     <button onClick={() => completeTask(task.id)} disabled={isTaskFuture} className={`w-20 h-9 rounded-lg text-xs font-bold transition-colors flex justify-center items-center ${isTaskFuture ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#28C8C8] text-white hover:bg-[#20a0a0] shadow-sm shadow-[#28C8C8]/30'}`}>{isTaskFuture ? '未開放' : '完成'}</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {myTasks.length > visibleMyTasksCount && <LoadMoreButton onClick={() => setVisibleMyTasksCount(prev => prev + 5)} />}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* --- LIST MODE (ALL TASKS) --- */}
            {rosterViewMode === 'list' && (
              <div>
                <div className="flex justify-between items-end mb-3 cursor-pointer group" onClick={() => setIsTaskListOpen(!isTaskListOpen)}>
                  <h3 className="font-bold text-gray-700 flex items-center gap-2 group-hover:text-[#28C8C8] transition-colors"><Users size={18} className="text-gray-400 group-hover:text-[#28C8C8] transition-colors" /> 任務列表 {isTaskListOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}</h3>
                  <span className="text-xs text-gray-400">依日期排序</span>
                </div>
                {isTaskListOpen && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
                    {(() => {
                      const allTasks = [...currentCycleTasks].sort((a, b) => a.date.localeCompare(b.date));
                      if (allTasks.length === 0) return <div className="p-8 text-center text-gray-400">目前沒有排班任務</div>;
                      const displayedAllTasks = allTasks.slice(0, visibleAllTasksCount);
                      return (
                        <>
                          <div className="divide-y divide-gray-50">
                            {displayedAllTasks.map(task => {
                              const isMine = task.currentHolderId === myProfile?.userId;
                              const isOpen = task.status === 'open';
                              const isDone = task.status === 'done';
                              const isTaskFuture = isFutureDate(task.date);
                              
                              return (
                                <div key={task.id} className={`p-4 flex items-center justify-between transition-colors ${isOpen ? 'bg-red-50/50' : 'hover:bg-gray-50'}`}>
                                  <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 ${isDone ? 'bg-green-100 opacity-50' : 'bg-gray-100'}`}>{task.icon}</div>
                                    <div>
                                      <h4 className={`font-bold ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task.name}</h4>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs bg-gray-100 px-1.5 rounded text-gray-500 font-mono">{task.date}</span>
                                        {!isDone && (<div className="flex items-center gap-1.5">{isOpen ? <span className="text-xs text-red-500 font-medium">賞金 ${task.price}</span> : (<><div className={`w-3 h-3 rounded-full ${getUserAvatar(task.currentHolderId)}`}></div><span className={`text-xs ${isMine ? 'font-bold text-[#28C8C8]' : 'text-gray-500'}`}>{getUserName(task.currentHolderId)}{isMine && ' (我)'}</span></>)}</div>)}
                                      </div>
                                    </div>
                                  </div>
                                  <div>
                                    {isOpen ? (
                                       <button onClick={() => claimBounty(task.id)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm shadow-red-200 active:scale-95 transition-transform w-20 h-9 flex justify-center items-center">接單 +${task.price}</button>
                                    ) : isDone ? (
                                       <CheckCircle2 className="text-green-300" size={24} />
                                    ) : isMine ? (
                                       <button onClick={() => completeTask(task.id)} disabled={isTaskFuture} className={`w-20 h-9 rounded-lg text-xs font-bold transition-colors flex justify-center items-center ${isTaskFuture ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'border-2 border-[#28C8C8]/30 hover:bg-[#28C8C8]/10 text-[#28C8C8]'}`}>{isTaskFuture ? '未開放' : <CheckCircle2 size={18} />}</button>
                                    ) : (
                                       <span className="text-xs text-gray-300 font-mono">Pending</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {allTasks.length > visibleAllTasksCount && <LoadMoreButton onClick={() => setVisibleAllTasksCount(prev => prev + 5)} />}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
            
            {/* --- CALENDAR MODE --- */}
            {rosterViewMode === 'calendar' && (
              <div className="animate-fade-in">
                {/* ... (省略日曆模式 UI 程式碼，與之前相同) ... */}
              </div>
            )}
            
            <div className="mt-6 flex justify-center pb-20">
               <button onClick={() => dispatchTasksFromConfig(true)} className="text-xs text-gray-400 hover:text-[#28C8C8] flex items-center gap-1"><Play size={10} /> 重置並模擬排班</button>
            </div>
          </div>
        )}

        {/* VIEW: WALLET, HISTORY, SETTINGS (Same as before) */}
        {/* ... (省略重複的 UI 程式碼，邏輯已在上方更新) ... */}
      </main>

      {/* Tab Bar */}
      {view !== 'settings_editor' && (
        <nav className="bg-white border-t flex justify-around pb-safe pt-1 sticky bottom-0 z-10 shrink-0">
          <TabButton id="roster" label="值日表" icon={CalendarDays} />
          <TabButton id="wallet" label="帳本" icon={Wallet} />
          <TabButton id="history" label="動態" icon={History} />
          <TabButton id="settings" label="設定" icon={Settings} />
        </nav>
      )}

    </div>
  );
}