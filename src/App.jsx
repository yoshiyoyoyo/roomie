import React, { useState, useEffect, useRef } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove, get, off } from "firebase/database";
import { 
  Trash2, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  ChevronDown, ChevronUp, Check, Loader2, LogOut, Home, Plus, 
  ArrowRight, AlertCircle, RotateCcw
} from 'lucide-react';

// ==========================================
// ⚙️ 系統設定
// ==========================================
const LIFF_ID = "2009134573-7SuphV8b"; 
// 🔥 每次資料庫大清空，改這個版號，使用者的快取就會自動被清掉
const APP_VERSION = "v1_db_reset_2024_new"; 

const firebaseConfig = {
  apiKey: "AIzaSyBBiEaI_-oH34YLpB4xmlJljyOtxz-yty4",
  authDomain: "roomie-task.firebaseapp.com",
  databaseURL: "https://roomie-task-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "roomie-task",
  storageBucket: "roomie-task.firebasestorage.app",
  messagingSenderId: "233849609695",
  appId: "1:233849609695:web:0c76a4b9b40070cf22386a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 工具函式
const getTodayString = () => new Date().toISOString().split('T')[0];
const addDays = (dateStr, days) => {
  const result = new Date(dateStr);
  result.setDate(result.getDate() + parseInt(days));
  return result.toISOString().split('T')[0];
};
const generateId = () => Math.random().toString(36).substr(2, 9);

// 🔥 改良版存取函式：加入版本檢查
const getSavedGroups = () => {
  try { 
    // 檢查版本
    const savedVer = localStorage.getItem('app_version');
    if (savedVer !== APP_VERSION) {
        console.log("發現舊版本資料，執行自動清洗...");
        localStorage.clear(); // 清空舊資料
        localStorage.setItem('app_version', APP_VERSION); // 寫入新版本
        return [];
    }
    return JSON.parse(localStorage.getItem('roomie_groups') || '[]'); 
  } catch (e) { return []; }
};

const EMOJI_LIST = [
  "🧹", "🗑️", "🍽️", "🧺", "🚽", "🍳", "🛒", "📦", "✨", "🐶", 
  "🐱", "🪴", "🚿", "🧽", "🧼", "🪣", "🪟", "🔧", "💡", "🛋️",
  "🛏️", "🧴", "🧻", "📅", "💰", "🧾", "📝", "📢", "🚗", "🚲"
];

export default function RoomieTaskApp() {
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState('landing'); 
  const [groupId, setGroupId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
  // Data
  const [users, setUsers] = useState([]);
  const [taskConfigs, setTaskConfigs] = useState([]);
  const [currentCycleTasks, setCurrentCycleTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [myGroups, setMyGroups] = useState([]);

  // UI Views
  const [view, setView] = useState('roster');
  const [rosterTab, setRosterTab] = useState('mine');
  const mainScrollRef = useRef(null);
  
  // Ref for cleanup
  const isQuittingRef = useRef(false);
  const dbRef = useRef(null);

  // 列表控制
  const [myTasksLimit, setMyTasksLimit] = useState(5);
  const [allTasksLimit, setAllTasksLimit] = useState(5);

  // Modals
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showQuitModal, setShowQuitModal] = useState(false);
  
  const [newNameInput, setNewNameInput] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  
  const [alertMsg, setAlertMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Config Editor
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [configForm, setConfigForm] = useState({ 
    name: '', price: 30, freq: 7, icon: '🧹', assigneeOrder: [], nextDate: getTodayString() 
  });
  
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // ==========================================
  // 🚀 初始化 (已修復：解決重複套疊與 catch undefined 問題)
  // ==========================================
  useEffect(() => {
    // 確保版本一致
    const savedVer = localStorage.getItem('app_version');
    if (savedVer !== APP_VERSION) {
        localStorage.clear();
        localStorage.setItem('app_version', APP_VERSION);
    }

    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    if (isLocal) {
      console.log("🔧 本地開發模式");
      const mockUser = { 
        userId: "local-tester-001", 
        displayName: "本地測試員", 
        pictureUrl: "https://ui-avatars.com/api/?name=Tester&background=random" 
      };
      setCurrentUser({ id: mockUser.userId, name: mockUser.displayName, avatar: mockUser.pictureUrl });
      setMyGroups(getSavedGroups());
      
      const gId = new URLSearchParams(window.location.search).get('g');
      if (gId) enterGroup(gId, { id: mockUser.userId, name: mockUser.displayName, avatar: mockUser.pictureUrl });
      else setLoading(false);
      return; 
    }

    let isMounted = true; // 防止 React 嚴格模式重複執行導致狀態錯亂

    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        
        if (!isMounted) return;

        if (!liff.isLoggedIn()) { 
          liff.login({ redirectUri: window.location.href }); 
          return; 
        }
        
        try {
          const profile = await liff.getProfile();
          if (!isMounted) return;

          const user = { id: profile.userId, name: profile.displayName, avatar: profile.pictureUrl };
          setCurrentUser(user);
          
          // 先用本地快取墊檔，讓畫面秒開
          setMyGroups(getSavedGroups());

          // 🌟 新增：從雲端資料庫撈取真實的群組名單，解決跨瀏覽器空清單問題
          const snap = await get(ref(db, 'groups'));
          if (snap.exists() && isMounted) {
            const allGroups = snap.val();
            const joinedGroups = [];
            for (const [gId, groupData] of Object.entries(allGroups)) {
              if (groupData.users && groupData.users[user.id]) {
                joinedGroups.push({ id: gId, name: groupData.metadata?.name || '我的空間' });
              }
            }
            // 更新畫面並同步回本地快取
            setMyGroups(joinedGroups);
            localStorage.setItem('roomie_groups', JSON.stringify(joinedGroups));
          }

          const gId = new URLSearchParams(window.location.search).get('g');
          if (gId) enterGroup(gId, user); else setLoading(false);
          
        } catch (profileError) {
          console.error("LIFF getProfile 失敗:", profileError);
          liff.logout();
          window.location.reload();
        }

      } catch (err) {
        console.error("LIFF 初始化失敗:", err);
        if (err.message && err.message.toLowerCase().includes("expired")) {
          liff.logout();
          window.location.reload();
          return;
        }
        if (isMounted) {
          setLoading(false);
          alert(`系統錯誤: ${err?.message || "無法載入 LINE 服務"}`);
        }
      }
    };

    initLiff();

    return () => {
      isMounted = false;
      if (dbRef.current) off(dbRef.current);
    };
  }, []);

  // ==========================================
  // 🚀 以下為原本的邏輯
  // ==========================================

  const handleNav = (targetView) => {
    setView(targetView);
    setIsUserMenuOpen(false);
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
  };

  const handleGoHome = () => {
    if (dbRef.current) off(dbRef.current);
    isQuittingRef.current = false;
    setGroupId(null);
    setViewState('landing');
    setIsUserMenuOpen(false);
    window.history.pushState({}, '', window.location.pathname);
  };

  const enterGroup = async (gId, user) => {
    if (isQuittingRef.current) return;
    setLoading(true);
    setGroupId(gId);
    
    if (dbRef.current) off(dbRef.current);
    
    try {
      const snapshot = await get(ref(db, `groups/${gId}`));
      if (!snapshot.exists()) {
         const saved = getSavedGroups();
         const newGroups = saved.filter(g => g.id !== gId);
         localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
         setMyGroups(newGroups);
         
         setLoading(false);
         setGroupId(null);
         alert("此空間已不存在");
         // 回到首頁並清除 URL
         window.history.pushState({}, '', window.location.pathname);
         return;
      }
      await checkAndGenerateTasks(gId, snapshot.val()); 
    } catch (e) { 
      console.error(e);
      setLoading(false);
    }

    const groupRef = ref(db, `groups/${gId}`);
    dbRef.current = groupRef;

    const newUrl = `${window.location.pathname}?g=${gId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);

    onValue(groupRef, (snap) => {
      if (isQuittingRef.current) return;

      const data = snap.val();
      if (data) {
        if (user && user.id && (!data.users || !data.users[user.id])) {
            const saved = getSavedGroups();
            if (saved.find(g => g.id === gId)) {
                const newGroups = saved.filter(g => g.id !== gId);
                localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
                setMyGroups(newGroups);
                setViewState('landing');
                setLoading(false);
                return;
            } else {
                registerMember(gId, user);
            }
        }

        const safeUsers = data.users ? Object.values(data.users).filter(u => u && u.id) : [];
        setUsers(safeUsers);
        
        const safeConfigs = data.taskConfigs ? Object.values(data.taskConfigs).filter(c => c && c.id) : [];
        setTaskConfigs(safeConfigs);
        
        const safeTasks = data.tasks ? Object.values(data.tasks).filter(t => t && t.id && t.date) : [];
        setCurrentCycleTasks(safeTasks.sort((a,b) => (a.date || '').localeCompare(b.date || '')));
        
        const safeLogs = data.logs ? Object.values(data.logs).filter(l => l).sort((a,b) => b.id - a.id) : [];
        setLogs(safeLogs);
        
        setGroupName(data.metadata?.name || '我的空間');
        
        if (user && user.id && data.users && data.users[user.id] && !isQuittingRef.current) {
            const saved = getSavedGroups();
            const currentName = data.metadata?.name || '新空間';
            const isNameDiff = saved.find(g => g.id === gId)?.name !== currentName;
            
            if (!saved.find(g => g.id === gId) || isNameDiff) {
              const otherGroups = saved.filter(g => g.id !== gId);
              const updated = [{ id: gId, name: currentName }, ...otherGroups].slice(0, 10);
              localStorage.setItem('roomie_groups', JSON.stringify(updated));
              setMyGroups(updated);
            }
        }
        
        setViewState('app');
      } else { 
        setViewState('landing'); 
      }
      setLoading(false);
    });
  };

  const checkAndGenerateTasks = async (gId, data) => {
    if (!data || !data.taskConfigs || !data.users) return;
    const updates = {};
    const configs = Object.values(data.taskConfigs);
    const allUserIds = Object.keys(data.users);
    if (allUserIds.length === 0) return;

    let hasUpdates = false;
    const limitDate = addDays(getTodayString(), 45); 

    configs.forEach(cfg => {
      let nextDate = cfg.nextDate || getTodayString();
      let order = (cfg.assigneeOrder && cfg.assigneeOrder.length > 0) ? cfg.assigneeOrder : allUserIds;
      order = order.filter(uid => allUserIds.includes(uid));
      if (order.length === 0) order = allUserIds;

      let runningAssigneeId = cfg.nextAssigneeId;
      if (!runningAssigneeId || !order.includes(runningAssigneeId)) runningAssigneeId = order[0];

      let loopCount = 0;
      while (nextDate <= limitDate && loopCount < 50) {
        loopCount++;
        const tid = `task-${cfg.id}-${nextDate.replace(/-/g, '')}`;
        if (!data.tasks || !data.tasks[tid]) {
            updates[`groups/${gId}/tasks/${tid}`] = {
              id: tid, configId: cfg.id, name: cfg.name, price: cfg.price, icon: cfg.icon,
              date: nextDate, status: 'pending', currentHolderId: runningAssigneeId
            };
        }
        const currIdx = order.indexOf(runningAssigneeId);
        const nextIdx = (currIdx + 1) % order.length;
        runningAssigneeId = order[nextIdx];
        nextDate = addDays(nextDate, typeof cfg.freq === 'string' ? parseInt(cfg.freq.match(/\d+/)?.[0] || '7') : cfg.freq);
        updates[`groups/${gId}/taskConfigs/${cfg.id}/nextDate`] = nextDate;
        updates[`groups/${gId}/taskConfigs/${cfg.id}/nextAssigneeId`] = runningAssigneeId; 
        hasUpdates = true;
      }
    });
    if (hasUpdates) await update(ref(db), updates);
  };

  const clearFutureTasks = async (configId) => {
    const tasksToRemove = currentCycleTasks.filter(t => t.configId === configId && t.status !== 'done');
    const updates = {};
    tasksToRemove.forEach(t => { updates[`groups/${groupId}/tasks/${t.id}`] = null; });
    if (Object.keys(updates).length > 0) await update(ref(db), updates);
  };

  const registerMember = (gId, user) => {
    update(ref(db, `groups/${gId}/users/${user.id}`), { ...user, balance: 0, joinedAt: serverTimestamp() });
  };

  const handleRenameGroup = async () => {
    if (newNameInput.trim()) {
      await update(ref(db, `groups/${groupId}/metadata`), { name: newNameInput });
      const newGroups = myGroups.map(g => g.id === groupId ? { ...g, name: newNameInput } : g);
      setMyGroups(newGroups);
      localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
      setShowRenameModal(false);
    }
  };

  const handleResetGroup = async () => {
    try {
        const updates = {};
        updates[`groups/${groupId}/tasks`] = null;
        updates[`groups/${groupId}/logs`] = null;
        updates[`groups/${groupId}/taskConfigs`] = null;
        users.forEach(u => updates[`groups/${groupId}/users/${u.id}/balance`] = 0);
        
        await update(ref(db), updates);

        const logId = Date.now();
        await set(ref(db, `groups/${groupId}/logs/${logId}`), { 
            id: logId, msg: `${currentUser.name} 重置了群組`, type: 'warning', time: new Date().toLocaleTimeString() 
        });

        setShowResetModal(false);
        setAlertMsg("群組已完全重置");
    } catch (e) { alert("重置失敗"); }
  };

  const handleQuitGroupConfirm = async () => {
    isQuittingRef.current = true; 
    if (dbRef.current) off(dbRef.current);
    try {
      const logId = Date.now();
      await set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `${currentUser.name} 離開了空間`, type: 'warning', time: new Date().toLocaleTimeString() });
      await remove(ref(db, `groups/${groupId}/users/${currentUser.id}`));
      
      const currentSaved = getSavedGroups(); // 重新讀取確保準確
      const newGroups = currentSaved.filter(g => g.id !== groupId);
      localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
      setMyGroups(newGroups);
      
      setShowQuitModal(false);
      handleGoHome();
    } catch (e) { alert("退出失敗，請重試"); isQuittingRef.current = false; }
  };

  const handleCreateGroupConfirm = async () => {
    if (!newGroupName.trim()) return;
    setLoading(true);
    isQuittingRef.current = false;

    const gid = `rm-${generateId()}`;
    await set(ref(db, `groups/${gid}`), { 
        metadata: { name: newGroupName, createdAt: serverTimestamp() }, 
        users: { [currentUser.id]: { ...currentUser, balance: 0, joinedAt: serverTimestamp() } },
        logs: { [Date.now()]: { id: Date.now(), msg: `空間「${newGroupName}」已建立`, type: 'info', time: new Date().toLocaleTimeString() } } 
    });
    setShowCreateGroupModal(false);
    enterGroup(gid, currentUser);
  };

  const completeTask = async (task) => {
    if (task.date > getTodayString()) { setAlertMsg("只能完成今天以前的任務喔！"); return; }
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'done';
    if (task.originalHolderId && task.originalHolderId !== currentUser.id) {
        const originalUser = users.find(u => u.id === task.originalHolderId);
        const myUser = users.find(u => u.id === currentUser.id);
        if (originalUser && myUser) {
            updates[`groups/${groupId}/users/${task.originalHolderId}/balance`] = originalUser.balance - (task.price || 0);
            updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myUser.balance + (task.price || 0);
            const logId = Date.now();
            updates[`groups/${groupId}/logs/${logId}`] = { 
                id: logId, msg: `${currentUser.name} 完成了 ${task.name} (由 ${originalUser.name} 支付)`, type: 'success', time: new Date().toLocaleTimeString() 
            };
        }
    } else {
        const logId = Date.now();
        updates[`groups/${groupId}/logs/${logId}`] = { id: logId, msg: `${currentUser.name} 完成了 ${task.name}`, type: 'success', time: new Date().toLocaleTimeString() };
    }
    await update(ref(db), updates);
  };
  
  const releaseTask = async (task) => {
    update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'open', currentHolderId: null, originalHolderId: currentUser.id });
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `${currentUser.name} 釋出 ${task.name}`, type: 'warning', time: new Date().toLocaleTimeString() });
  };

  const claimTask = async (task) => {
    update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'pending', currentHolderId: currentUser.id });
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `${currentUser.name} 接手了 ${task.name}`, type: 'info', time: new Date().toLocaleTimeString() });
  };

  const toggleUserInOrder = (uid) => {
    const currentOrder = configForm.assigneeOrder || [];
    if (currentOrder.includes(uid)) {
      setConfigForm({ ...configForm, assigneeOrder: currentOrder.filter(id => id !== uid) });
    } else {
      setConfigForm({ ...configForm, assigneeOrder: [...currentOrder, uid] });
    }
  };

  const handleOpenAddConfig = () => {
    setEditingConfigId(null);
    setConfigForm({ 
      name: '', price: 30, freq: 7, icon: '🧹', 
      assigneeOrder: users.map(u => u.id), 
      nextDate: getTodayString() 
    });
    setFormError('');
    setIsEditingConfig(true);
  };

  const saveConfig = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (!configForm.name.trim()) { alert("請輸入家事名稱！"); setIsSaving(false); return; }
      if (configForm.price <= 0 || configForm.freq <= 0) { alert("金額與頻率必須大於 0！"); setIsSaving(false); return; }
      
      let assigneeOrder = configForm.assigneeOrder;
      if (!assigneeOrder || assigneeOrder.length === 0) {
        assigneeOrder = users.map(u => u.id);
      }

      const id = editingConfigId || `cfg-${generateId()}`;
      const freqStr = typeof configForm.freq === 'string' ? configForm.freq : `每 ${configForm.freq} 天`;
      const freqNum = parseInt(String(configForm.freq).match(/\d+/)?.[0] || '7');

      const updates = {};

      let earliestPendingDate = null;
      const tasksSnap = await get(ref(db, `groups/${groupId}/tasks`));
      
      if (tasksSnap.exists()) {
          const allTasks = tasksSnap.val();
          const relatedTasks = Object.values(allTasks).filter(t => t.configId === id && t.status !== 'done');
          if (relatedTasks.length > 0) {
              relatedTasks.sort((a,b) => a.date.localeCompare(b.date));
              earliestPendingDate = relatedTasks[0].date;
              relatedTasks.forEach(t => {
                  updates[`groups/${groupId}/tasks/${t.id}`] = null;
              });
          }
      }

      let nextDate;
      if (editingConfigId && earliestPendingDate) {
          nextDate = earliestPendingDate; 
      } else {
          nextDate = configForm.nextDate || getTodayString();
      }

      let runningAssigneeId = assigneeOrder[0];
      if (editingConfigId && configForm.nextAssigneeId && assigneeOrder.includes(configForm.nextAssigneeId)) {
          runningAssigneeId = configForm.nextAssigneeId;
      }

      const limitDate = addDays(getTodayString(), 45);
      let loopCount = 0;

      while (nextDate <= limitDate && loopCount < 50) {
          loopCount++;
          const tid = `task-${id}-${nextDate.replace(/-/g, '')}`;
          updates[`groups/${groupId}/tasks/${tid}`] = {
              id: tid, configId: id, name: configForm.name, price: configForm.price, icon: configForm.icon,
              date: nextDate, status: 'pending', currentHolderId: runningAssigneeId
          };
          const currIdx = assigneeOrder.indexOf(runningAssigneeId);
          const nextIdx = (currIdx + 1) % assigneeOrder.length;
          runningAssigneeId = assigneeOrder[nextIdx];
          nextDate = addDays(nextDate, freqNum);
      }

      const configData = { 
        ...configForm, id, freq: freqStr, assigneeOrder, 
        nextAssigneeId: runningAssigneeId, nextDate: nextDate 
      };
      updates[`groups/${groupId}/taskConfigs/${id}`] = configData;

      await update(ref(db), updates);
      
      const logId = Date.now();
      const actionMsg = editingConfigId ? `編輯了家事：${configForm.name}` : `新增了家事：${configForm.name}`;
      await set(ref(db, `groups/${groupId}/logs/${logId}`), { 
         id: logId, msg: `${currentUser.name} ${actionMsg}`, type: 'info', time: new Date().toLocaleTimeString() 
      });

      setIsEditingConfig(false);
      setAlertMsg("排班已更新！");

    } catch (error) {
      console.error(error);
      alert("儲存失敗，請檢查網路");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteConfigConfirm = async () => {
    if (deleteTarget && deleteTarget.type === 'config') {
       const tasksSnap = await get(ref(db, `groups/${groupId}/tasks`));
       const updates = {};
       if (tasksSnap.exists()) {
           const allTasks = tasksSnap.val();
           Object.values(allTasks).forEach(t => {
               if (t.configId === deleteTarget.id) updates[`groups/${groupId}/tasks/${t.id}`] = null;
           });
       }
       updates[`groups/${groupId}/taskConfigs/${deleteTarget.id}`] = null;
       await update(ref(db), updates);
       setDeleteTarget(null);
    }
  };

  const calculateSettlements = () => {
    const validUsers = users.filter(u => u && typeof u.balance === 'number');
    if (validUsers.length === 0) return [];
    let balances = validUsers.filter(u => Math.abs(u.balance) > 0.1).map(u => ({...u}));
    let transactions = [];
    let debtors = balances.filter(u => u.balance < 0).sort((a,b) => a.balance - b.balance);
    let creditors = balances.filter(u => u.balance > 0).sort((a,b) => b.balance - a.balance);

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
       let debtor = debtors[i];
       let creditor = creditors[j];
       let amount = Math.min(Math.abs(debtor.balance), creditor.balance);
       if (amount > 0) {
         transactions.push({ fromId: debtor.id, fromName: debtor.name, toId: creditor.id, toName: creditor.name, amount: Math.round(amount) });
       }
       debtor.balance += amount; creditor.balance -= amount;
       if (Math.abs(debtor.balance) < 0.1) i++;
       if (creditor.balance < 0.1) j++;
    }
    return transactions;
  };

  const settleDebt = async (tx) => {
    const fromUser = users.find(u => u.id === tx.fromId);
    const toUser = users.find(u => u.id === tx.toId);
    if (!fromUser || !toUser) return;
    const updates = {};
    updates[`groups/${groupId}/users/${tx.fromId}/balance`] = fromUser.balance + tx.amount;
    updates[`groups/${groupId}/users/${tx.toId}/balance`] = toUser.balance - tx.amount;
    const logId = Date.now();
    updates[`groups/${groupId}/logs/${logId}`] = { id: logId, msg: `${tx.fromName} 支付了 $${tx.amount} 給 ${tx.toName} (已結清)`, type: 'info', time: new Date().toLocaleTimeString() };
    await update(ref(db), updates);
    setAlertMsg("結帳成功！");
  };

  const limitDate = addDays(getTodayString(), 45);
  const validConfigIds = taskConfigs.map(c => c.id);
  const visibleTasks = currentCycleTasks.filter(t => validConfigIds.includes(t.configId) && (t.date <= limitDate) && (t.status !== 'done' || t.date >= getTodayString()));
  const myTasks = visibleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending');
  const allTasks = visibleTasks;

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#28C8C8]"/></div>;

  if (viewState === 'landing') return (
    <div className="max-w-md mx-auto h-[100dvh] flex flex-col p-8 bg-white relative">
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-2">👋 嗨，{currentUser?.name}</h1>
        <p className="text-gray-500 mb-8">歡迎回到家事交易所</p>
        <h3 className="font-bold text-gray-800 mb-4 text-base">已加入的空間</h3>
        <div className="space-y-4">
          {myGroups.length === 0 ? (
            <div className="text-center py-10 text-gray-300 border-2 border-dashed rounded-2xl text-sm">還沒加入任何空間</div>
          ) : (
            myGroups.map(g => (
              <div key={g.id} onClick={() => { isQuittingRef.current = false; enterGroup(g.id, currentUser); }} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center active:scale-95 transition-all cursor-pointer">
                <span className="font-bold text-gray-700 text-base">{g.name}</span>
                <div className="text-[#28C8C8] font-bold text-base">進入</div>
              </div>
            ))
          )}
        </div>
      </div>
      <button onClick={() => { setNewGroupName(`${currentUser?.name || '我'} 的家`); setShowCreateGroupModal(true); }} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold shadow-xl shadow-[#28C8C8]/30 active:scale-95 transition-all text-lg">建立新空間</button>
      
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6">
            <h3 className="text-xl font-bold mb-4 text-center">建立新空間</h3>
            <input type="text" id="new-group-name" name="groupName" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="輸入空間名稱" className="w-full p-4 bg-gray-50 rounded-xl mb-6 text-center font-bold text-lg"/>
            <div className="flex gap-3">
              <button onClick={() => setShowCreateGroupModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">取消</button>
              <button onClick={handleCreateGroupConfirm} className="flex-1 py-3 bg-[#28C8C8] text-white rounded-xl font-bold">建立</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-gray-50 max-w-md mx-auto flex flex-col h-[100dvh]">
      <header className="flex-none bg-white p-4 border-b flex justify-between items-center z-50 shadow-sm relative">
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-lg text-gray-800 truncate max-w-[150px]">{groupName}</h1>
          <Edit2 size={16} className="text-gray-400 cursor-pointer hover:text-[#28C8C8]" onClick={() => { setNewNameInput(groupName); setShowRenameModal(true); }}/>
        </div>
        <div className="relative">
          <div onClick={(e) => { e.stopPropagation(); setIsUserMenuOpen(!isUserMenuOpen); }} className="flex items-center gap-2 bg-gray-100 p-1 pr-3 rounded-full cursor-pointer">
            <img src={currentUser?.avatar} className="w-8 h-8 rounded-full border border-white" />
            <span className="text-sm font-bold text-gray-700">{currentUser?.name}</span>
          </div>
          {isUserMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
              <div className="absolute right-0 top-12 w-48 bg-white border rounded-xl shadow-xl z-50 overflow-hidden">
                 <button onClick={handleGoHome} className="w-full text-left p-4 text-base border-b flex items-center gap-3 hover:bg-gray-50 font-bold text-gray-600"><Home size={18}/> 我的空間</button>
                 <button onClick={() => { setIsUserMenuOpen(false); setShowResetModal(true); }} className="w-full text-left p-4 text-base border-b flex items-center gap-3 hover:bg-gray-50 font-bold text-gray-700"><RotateCcw size={18}/> 重置群組</button>
                 <button onClick={() => { setIsUserMenuOpen(false); setShowQuitModal(true); }} className="w-full text-left p-4 text-base text-red-500 flex items-center gap-3 hover:bg-gray-50 font-bold"><LogOut size={18}/> 退出群組</button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24 overscroll-contain" ref={mainScrollRef}>
        {view === 'roster' && (
          <div className="space-y-6">
            <div className="sticky top-0 z-20 bg-white pt-2 pb-4 px-1">
              <div className="flex bg-gray-100 p-1 rounded-2xl">
                <button onClick={() => setRosterTab('mine')} className={`flex-1 py-3 rounded-xl text-base font-bold transition-all ${rosterTab === 'mine' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-400'}`}>近期待辦</button>
                <button onClick={() => setRosterTab('all')} className={`flex-1 py-3 rounded-xl text-base font-bold transition-all ${rosterTab === 'all' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-400'}`}>任務列表</button>
              </div>
            </div>

            {rosterTab === 'mine' && (
              <div className="space-y-3">
                {myTasks.length === 0 ? 
                  <div className="p-10 text-center text-gray-400 text-base bg-white rounded-2xl border border-dashed">目前沒有任務 🎉</div> :
                  myTasks.slice(0, myTasksLimit).map(task => (
                    <div key={task.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-3xl">{task.icon}</span>
                        <div><div className="font-bold text-base text-gray-800">{task.name}</div><div className="text-sm text-gray-400 font-bold">{task.date}</div></div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => releaseTask(task)} className="bg-red-50 text-red-500 px-4 py-2 rounded-xl text-sm font-bold">沒空</button>
                        <button onClick={() => completeTask(task)} className={`text-white px-4 py-2 rounded-xl text-sm font-bold ${task.date > getTodayString() ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#28C8C8]'}`}>完成</button>
                      </div>
                    </div>
                  ))
                }
                {myTasks.length > myTasksLimit && <button onClick={() => setMyTasksLimit(l => l + 5)} className="w-full py-3 text-center text-[#28C8C8] font-bold text-sm bg-gray-50 rounded-xl">查看更多</button>}
              </div>
            )}

            {rosterTab === 'all' && (
              <div className="space-y-3">
                {allTasks.length === 0 ? <div className="p-10 text-center text-gray-400 text-base bg-white rounded-2xl border border-dashed">目前沒有任務 🎉</div> :
                  allTasks.slice(0, allTasksLimit).map(task => {
                    const isOpen = task.status === 'open';
                    const isDone = task.status === 'done';
                    const holder = users.find(u => u.id === task.currentHolderId);
                    return (
                      <div key={task.id} className={`p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between ${isOpen ? 'bg-red-50' : 'bg-white'}`}>
                        <div className="flex items-center gap-4">
                          <span className={`text-3xl ${isDone ? 'opacity-30' : ''}`}>{task.icon}</span>
                          <div>
                            <div className="font-bold text-base text-gray-800">{task.name}</div>
                            <div className="text-sm text-gray-400 font-bold">{task.date} · {holder ? holder.name : '未分配'}</div>
                          </div>
                        </div>
                        {isOpen && <button onClick={() => claimTask(task)} className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md shadow-red-200">接單</button>}
                        {isDone && <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center text-green-500"><Check size={20}/></div>}
                      </div>
                    )
                  })
                }
                {allTasks.length > allTasksLimit && <button onClick={() => setAllTasksLimit(l => l + 5)} className="w-full py-3 text-center text-[#28C8C8] font-bold text-sm bg-gray-50 rounded-xl">查看更多</button>}
              </div>
            )}
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-6">
            <div className="bg-[#28C8C8] p-8 rounded-3xl text-white shadow-lg shadow-[#28C8C8]/30">
              <div className="text-sm opacity-80 mb-1">我的收支</div>
              <div className="text-4xl font-bold font-mono tracking-tight">${users.find(u => u.id === currentUser?.id)?.balance || 0}</div>
            </div>
            
            <div className="bg-white rounded-2xl border shadow-sm p-4">
              <h3 className="font-bold text-gray-800 mb-3 text-lg">還款建議</h3>
              <div className="space-y-2">
                 {calculateSettlements().length === 0 ? <p className="text-gray-400 text-sm py-2 text-center">目前帳務平衡，無需結算</p> : 
                   calculateSettlements().map((tx, idx) => (
                     <div key={idx} className="bg-gray-50 p-3 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          <span>{tx.fromName}</span>
                          <ArrowRight size={14} className="text-gray-400"/>
                          <span>{tx.toName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">${tx.amount}</span>
                          <button onClick={() => settleDebt(tx)} className="bg-[#28C8C8] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">結清</button>
                        </div>
                     </div>
                   ))
                 }
              </div>
            </div>

            <div className="bg-white rounded-2xl border divide-y">
               {users.map(u => (
                 <div key={u.id} className="p-5 flex justify-between items-center">
                   <div className="flex items-center gap-4"><img src={u.avatar} className="w-10 h-10 rounded-full"/><span className="font-bold text-base text-gray-800">{u.name}</span></div>
                   <span className={`font-bold font-mono text-xl ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>{u.balance >= 0 ? '+' : ''}{u.balance}</span>
                 </div>
               ))}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-100 ml-2">
            {logs.length === 0 ? <div className="text-center text-gray-400 py-10">暫無動態</div> : 
              logs.map(log => (
                <div key={log.id} className="relative pb-6">
                  <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-white ${log.type === 'success' ? 'bg-green-500' : log.type === 'warning' ? 'bg-red-500' : 'bg-[#28C8C8]'}`}></div>
                  <div className="text-base text-gray-800 font-bold">{log.msg}</div>
                  <div className="text-xs text-gray-400 font-bold mt-1">{log.time}</div>
                </div>
              ))
            }
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border shadow-sm">
               <div className="flex justify-between items-center mb-4 border-b pb-2">
                 <h3 className="font-bold text-gray-800 text-lg">室友列表</h3>
                 <button onClick={async () => {
                   const link = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
                   const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
                   if (!isLocal && liff.isApiAvailable('shareTargetPicker')) await liff.shareTargetPicker([{ type: "text", text: `🏠 加入我的家事空間：\n${link}` }]);
                   else { navigator.clipboard.writeText(link); setAlertMsg("連結已複製"); }
                 }} className="bg-[#28C8C8] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md flex items-center gap-1"><Plus size={16}/> 邀請室友</button>
               </div>
               <div className="space-y-3">
                 {users.map(u => (
                   <div key={u.id} className="flex items-center gap-3">
                     <img src={u.avatar} className="w-10 h-10 rounded-full border border-gray-100"/>
                     <span className="font-bold text-base text-gray-700">{u.name}</span>
                   </div>
                 ))}
               </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold text-gray-800 text-lg">家事規則</h3>
                <button onClick={handleOpenAddConfig} className="bg-[#28C8C8] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md flex items-center gap-1"><Plus size={16}/> 新增家事</button>
              </div>
              <div className="space-y-3">
                {taskConfigs.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-4 bg-white border rounded-xl shadow-sm">
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{c.icon}</span>
                      <div>
                        <div className="font-bold text-base text-gray-800">{c.name}</div>
                        <div className="text-sm text-gray-400 font-bold">${c.price} / {c.freq}</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Edit2 size={20} className="text-[#28C8C8] cursor-pointer" onClick={() => { 
                         setEditingConfigId(c.id); 
                         const freqNum = c.freq && typeof c.freq === 'string' ? parseInt(c.freq.match(/\d+/)?.[0] || '7') : 7;
                         setConfigForm({ 
                           ...c, 
                           freq: freqNum, 
                           nextDate: c.nextDate || getTodayString(), 
                           assigneeOrder: c.assigneeOrder || users.map(u => u.id),
                           nextAssigneeId: c.nextAssigneeId
                         }); 
                         setIsEditingConfig(true); 
                      }}/>
                      <Trash2 size={20} className="text-red-500 cursor-pointer" onClick={() => setDeleteTarget({ type: 'config', id: c.id })}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="flex-none bg-white border-t flex justify-around pb-8 pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-30">
        {[{id:'roster', icon:CheckCircle2, label:'值日表'}, {id:'wallet', icon:Wallet, label:'帳本'}, {id:'history', icon:Loader2, label:'動態'}, {id:'settings', icon:Settings, label:'設定'}].map(n => (
          <button key={n.id} onClick={() => handleNav(n.id)} className={`flex flex-col items-center w-full py-2 transition-all ${view === n.id ? 'text-[#28C8C8] scale-110' : 'text-gray-300'}`}><n.icon size={26}/><span className="text-xs font-bold mt-1.5">{n.label}</span></button>
        ))}
      </nav>

      {/* --- Modals --- */}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95">
             <h3 className="font-bold text-xl mb-4 text-gray-800">修改空間名稱</h3>
             <input type="text" id="rename-input" name="rename-input" value={newNameInput} onChange={e => setNewNameInput(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl mb-6 text-center font-bold text-lg"/>
             <div className="flex gap-3">
               <button onClick={() => setShowRenameModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">取消</button>
               <button onClick={handleRenameGroup} className="flex-1 py-3 bg-[#28C8C8] text-white rounded-xl font-bold">確定</button>
             </div>
          </div>
        </div>
      )}

      {/* Quit Modal */}
      {showQuitModal && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95">
             <div className="mb-4 text-red-500 flex justify-center"><AlertCircle size={48}/></div>
             <h3 className="font-bold text-xl mb-2 text-gray-800">確定退出群組？</h3>
             <p className="text-gray-500 mb-6 text-base">您將會從成員名單中移除，但歷史紀錄會保留。</p>
             <div className="flex gap-3">
               <button onClick={() => setShowQuitModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">取消</button>
               <button onClick={handleQuitGroupConfirm} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold">退出</button>
             </div>
          </div>
        </div>
      )}

      {/* Reset Modal (Red Style) */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95">
             <div className="mb-4 text-red-500 flex justify-center"><AlertCircle size={48}/></div>
             <h3 className="font-bold text-xl mb-2 text-gray-900">確定重置群組？</h3>
             <p className="text-gray-600 mb-6 text-base">這將清空所有任務、日誌與家事規則，並將所有人餘額歸零。</p>
             <div className="flex gap-3">
               <button onClick={() => setShowResetModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold">取消</button>
               <button onClick={handleResetGroup} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold">重置</button>
             </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95">
             <div className="mb-4 text-red-500 flex justify-center"><AlertCircle size={48}/></div>
             <h3 className="font-bold text-xl mb-2 text-gray-800">確定刪除？</h3>
             <p className="text-gray-500 mb-6 text-base">此動作將刪除規則及未來的待辦。</p>
             <div className="flex gap-3">
               <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">取消</button>
               <button onClick={deleteConfigConfirm} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold">刪除</button>
             </div>
          </div>
        </div>
      )}

      {/* Edit Config Modal */}
      {isEditingConfig && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end sm:justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 space-y-5 animate-in slide-in-from-bottom-5">
            <div className="flex justify-between items-center border-b pb-4">
              <h2 className="font-bold text-xl">{editingConfigId ? '編輯家事' : '新增家事'}</h2>
              <button onClick={() => setIsEditingConfig(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="flex gap-4 relative">
              <div onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="w-20 p-4 bg-gray-50 rounded-2xl text-center text-3xl cursor-pointer hover:bg-gray-100 h-14 flex items-center justify-center border border-gray-100">{configForm.icon}</div>
              <input type="text" id="task-name" name="taskName" placeholder="名稱 (如：倒垃圾)" value={configForm.name} onChange={e => setConfigForm({...configForm, name:e.target.value})} className="flex-1 p-4 bg-gray-50 rounded-2xl text-lg font-bold outline-none focus:ring-2 focus:ring-[#28C8C8] h-14"/>
              
              {showEmojiPicker && (
                <div className="absolute top-16 left-0 bg-white shadow-2xl rounded-2xl border p-4 grid grid-cols-6 gap-2 w-full z-50 h-64 overflow-y-auto">
                  {EMOJI_LIST.map(e => <button key={e} onClick={() => { setConfigForm({...configForm, icon:e}); setShowEmojiPicker(false); }} className="text-2xl hover:bg-gray-100 p-2 rounded-lg">{e}</button>)}
                </div>
              )}
            </div>
            {formError && <p className="text-red-500 text-sm font-bold ml-1">{formError}</p>}

            <div className="relative">
              <input type="number" id="task-price" name="taskPrice" value={configForm.price === 0 ? '' : configForm.price} onChange={e => setConfigForm({...configForm, price: e.target.value === '' ? 0 : Number(e.target.value)})} className="w-full h-14 px-4 pl-10 bg-gray-50 rounded-2xl font-mono text-xl font-bold outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">$</span>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">元</span>
            </div>

            <div className="relative">
              <input type="number" id="task-freq" name="taskFreq" value={configForm.freq === 0 ? '' : configForm.freq} onChange={e => setConfigForm({...configForm, freq: e.target.value === '' ? 0 : Number(e.target.value)})} className="w-full h-14 px-4 pl-14 bg-gray-50 rounded-2xl font-mono text-xl font-bold outline-none focus:ring-2 focus:ring-[#28C8C8] text-left"/>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">每</span>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">日一次</span>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-bold text-gray-400 ml-1">排班人員順序</span>
              <div id="assignee-order" className="flex gap-4 overflow-x-auto pb-4 px-2 pt-2">
                {users.map(u => {
                  if (!u || !u.id) return null; // 防呆
                  const idx = (configForm.assigneeOrder || []).indexOf(u.id);
                  const isSelected = idx !== -1;
                  return (
                    <div key={u.id} onClick={() => toggleUserInOrder(u.id)} className={`relative flex-none w-14 h-14 rounded-full border-2 cursor-pointer transition-all ${isSelected ? 'border-[#28C8C8] ring-2 ring-[#28C8C8]/30' : 'border-gray-200 grayscale opacity-60'}`}>
                      <img src={u.avatar} className="w-full h-full rounded-full"/>
                      {isSelected && <div className="absolute -top-2 -right-2 w-6 h-6 bg-[#28C8C8] text-white text-xs font-bold flex items-center justify-center rounded-full shadow-sm z-10">{idx + 1}</div>}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1">
                <label htmlFor="start-date" className="text-sm font-bold text-gray-400 ml-1">何時開始</label>
                <input type="date" id="start-date" name="startDate" value={configForm.nextDate} onChange={e => setConfigForm({...configForm, nextDate:e.target.value})} className="w-full h-14 px-3 bg-gray-50 rounded-2xl font-bold outline-none text-lg"/>
            </div>

            <button onClick={saveConfig} disabled={isSaving} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold text-xl shadow-xl shadow-[#28C8C8]/20 active:scale-95 transition-transform disabled:opacity-50">{isSaving ? '儲存中...' : '儲存家事'}</button>
          </div>
        </div>
      )}

      {/* Alert */}
      {alertMsg && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-6" onClick={() => setAlertMsg(null)}>
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 text-center animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="mb-4 text-[#28C8C8] flex justify-center"><CheckCircle2 size={40}/></div>
            <h3 className="font-bold text-gray-800 mb-6 text-lg">{alertMsg}</h3>
            <button onClick={() => setAlertMsg(null)} className="w-full py-3 bg-gray-100 rounded-xl font-bold text-gray-600">好</button>
          </div>
        </div>
      )}
    </div>
  );
}