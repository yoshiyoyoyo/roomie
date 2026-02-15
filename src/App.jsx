import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp } from "firebase/database";
import { 
  Trash2, Sparkles, Wallet, Users, CheckCircle2, AlertCircle, Clock, 
  Plus, ArrowRight, History, Settings, Edit2, Save, X, Play, 
  CalendarDays, UserPlus, List, ChevronLeft, ChevronRight, User, 
  Calendar, ChevronDown, ChevronUp, Check, Loader2, LogOut
} from 'lucide-react';

// ==========================================
// ⚙️ 系統設定區 (System Config)
// ==========================================

const LIFF_ID = "2009134573-7SuphV8b";

const firebaseConfig = {
  apiKey: "AIzaSyBBiEaI_-oH34YLpB4xmlJljyOtxz-yty4",
  authDomain: "roomie-task.firebaseapp.com",
  databaseURL: "https://roomie-task-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "roomie-task",
  storageBucket: "roomie-task.firebasestorage.app",
  messagingSenderId: "233849609695",
  appId: "1:233849609695:web:0c76a4b9b40070cf22386a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 🛠️ 工具函式 (Utils)
// ==========================================

const getTodayString = () => new Date().toISOString().split('T')[0];
const isFutureDate = (dateStr) => dateStr > getTodayString();
const generateGroupId = () => `rm-${Math.random().toString(36).substr(2, 9)}`;

// ==========================================
// 📱 主應用程式 (Main App)
// ==========================================

export default function RoomieTaskApp() {
  // --- 核心狀態 (Core State) ---
  const [loading, setLoading] = useState(true);
  const [isLandingPage, setIsLandingPage] = useState(false);
  const [groupId, setGroupId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null); // LINE 用戶資料
  
  // --- 數據狀態 (Data State - From Firebase) ---
  const [users, setUsers] = useState([]);
  const [taskConfigs, setTaskConfigs] = useState([]);
  const [currentCycleTasks, setCurrentCycleTasks] = useState([]);
  const [logs, setLogs] = useState([]);

  // --- UI 狀態 ---
  const [view, setView] = useState('roster');
  const [rosterViewMode, setRosterViewMode] = useState('list');
  const [isMyTasksOpen, setIsMyTasksOpen] = useState(true);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);

  // ==========================================
  // 🔄 初始化邏輯
  // ==========================================
  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. 初始化 LIFF
        await liff.init({ liffId: LIFF_ID });
        
        // 檢查是否登入，若無則跳轉 LINE 登入
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const lineUser = {
          id: profile.userId,
          name: profile.displayName,
          avatar: profile.pictureUrl
        };
        setCurrentUser(lineUser);

        // 2. 處理 URL 參數 (?g=groupId)
        const params = new URLSearchParams(window.location.search);
        const gId = params.get('g');

        if (!gId) {
          setIsLandingPage(true);
          setLoading(false);
          return;
        }

        setGroupId(gId);

        // 3. 連接 Firebase 實時資料庫
        const groupRef = ref(db, `groups/${gId}`);
        onValue(groupRef, (snapshot) => {
          const data = snapshot.val();
          
          if (data) {
            // 同步資料到本地 State
            setUsers(data.users ? Object.values(data.users) : []);
            setTaskConfigs(data.taskConfigs ? Object.values(data.taskConfigs) : []);
            
            // 轉換 Tasks 物件為陣列並排序
            const tasksList = data.tasks ? Object.values(data.tasks) : [];
            tasksList.sort((a, b) => a.date.localeCompare(b.date));
            setCurrentCycleTasks(tasksList);
            
            setLogs(data.logs ? Object.values(data.logs).reverse() : []);

            // 4. 自動註冊邏輯：若此人不在 Firebase 名單中，自動加入
            if (!data.users || !data.users[lineUser.id]) {
              registerNewMember(gId, lineUser);
            }
          } else {
            // 有 ID 但資料庫沒資料（可能是錯誤連結），導回首頁
            setIsLandingPage(true);
          }
          setLoading(false);
        });

      } catch (err) {
        console.error("App 初始化失敗:", err);
        setLoading(false);
      }
    };

    initApp();
  }, []);

  // ==========================================
  // ✍️ Firebase 寫入操作 (Actions)
  // ==========================================

  // 自動註冊新成員
  const registerNewMember = async (gId, user) => {
    const userRef = ref(db, `groups/${gId}/users/${user.id}`);
    await set(userRef, {
      ...user,
      balance: 0,
      joinedAt: serverTimestamp()
    });
    addLog(gId, `👋 歡迎新室友 ${user.name} 加入！`, 'success');
  };

  // 建立新群組
  const handleCreateGroup = async () => {
    setLoading(true);
    const newGid = generateGroupId();
    const groupRef = ref(db, `groups/${newGid}`);
    
    // 預設資料結構
    const initialData = {
      metadata: { creator: currentUser.name, createdAt: serverTimestamp() },
      users: {
        [currentUser.id]: { ...currentUser, balance: 0 }
      },
      taskConfigs: [
        { id: 'cfg1', name: '倒垃圾', price: 30, freq: '每 7 天', icon: '🗑️', defaultAssigneeId: currentUser.id, nextDate: getTodayString() },
        { id: 'cfg2', name: '掃廁所', price: 50, freq: '每 14 天', icon: '🚽', defaultAssigneeId: currentUser.id, nextDate: getTodayString() }
      ],
      logs: {
        [Date.now()]: { id: Date.now(), msg: `🏠 空間已由 ${currentUser.name} 建立`, type: 'info', time: new Date().toLocaleTimeString() }
      }
    };

    await set(groupRef, initialData);
    
    // 重新導向到帶有 groupId 的網址
    window.location.href = `?g=${newGid}`;
  };

  // 完成任務
  const completeTask = async (task) => {
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'done';
    
    await update(ref(db), updates);
    addLog(groupId, `✅ ${currentUser.name} 完成了 ${task.name}`, 'success');
  };

  // 釋出任務 (變為賞金任務)
  const releaseTaskToBounty = async (task) => {
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'open';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = null; // 清除負責人
    
    // 扣除釋出者的餘額
    const myCurrentBalance = users.find(u => u.id === currentUser.id)?.balance || 0;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myCurrentBalance - task.price;

    await update(ref(db), updates);
    addLog(groupId, `💸 ${currentUser.name} 釋出 ${task.name} (賞金 $${task.price})`, 'warning');
  };

  // 接手賞金任務
  const claimBountyTask = async (task) => {
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'pending';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = currentUser.id;
    
    // 增加接手者的餘額
    const myCurrentBalance = users.find(u => u.id === currentUser.id)?.balance || 0;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myCurrentBalance + task.price;

    await update(ref(db), updates);
    addLog(groupId, `💰 ${currentUser.name} 接手了 ${task.name} 賺取 $${task.price}`, 'success');
  };

  // 記錄日誌
  const addLog = (gId, msg, type = 'info') => {
    const logId = Date.now();
    set(ref(db, `groups/${gId}/logs/${logId}`), {
      id: logId, msg, type, time: new Date().toLocaleTimeString()
    });
  };

  // 邀請功能 (已修正：使用 LIFF URL 避免迴圈)
  const shareInvite = async () => {
    // ❌ 原本錯誤的寫法 (會產生 Vercel 網址):
    // const inviteLink = `${window.location.origin}${window.location.pathname}?g=${groupId}`;
    
    // ✅ 正確的寫法 (產生 LIFF 專屬網址):
    const inviteLink = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
    
    if (liff.isApiAvailable('shareTargetPicker')) {
      try {
        await liff.shareTargetPicker([
          {
            type: "text",
            text: `🏠 邀請你加入我們的家事值日生群組！\n點擊連結加入排班與記帳：\n${inviteLink}`
          }
        ]);
      } catch (error) {
        console.log("Share target picker cancelled or failed", error);
      }
    } else {
      navigator.clipboard.writeText(inviteLink);
      alert("連結已複製，請手動傳送給室友！");
    }
  };
  // 臨時功能：手動產生測試任務 (因為還沒寫排班 cron job)
  const generateTestTasks = async () => {
    const newTaskId = `task-${Date.now()}`;
    const newTask = {
      id: newTaskId,
      name: '測試倒垃圾',
      price: 30,
      icon: '🗑️',
      date: getTodayString(),
      status: 'pending',
      currentHolderId: currentUser.id,
      configId: 'cfg1'
    };
    await set(ref(db, `groups/${groupId}/tasks/${newTaskId}`), newTask);
  };

  // ==========================================
  // 🖼️ UI 渲染 (Render)
  // ==========================================

  // 1. 載入畫面
  if (loading) return (
    <div className="flex flex-col h-[100dvh] items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-[#28C8C8] mb-4" size={48} />
      <p className="text-gray-500 font-medium">正在進入專屬空間...</p>
    </div>
  );

  // 2. 首頁 (建立群組)
  if (isLandingPage) return (
    <div className="flex flex-col items-center justify-center h-[100dvh] p-8 bg-white text-center">
      <div className="w-24 h-24 bg-[#28C8C8]/10 rounded-full flex items-center justify-center mb-8 animate-bounce">
        <Sparkles size={48} className="text-[#28C8C8]" />
      </div>
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Roomie Task</h1>
      <p className="text-gray-500 mb-10 leading-relaxed">
        這是一個讓室友生活更簡單的工具。<br/>建立空間並邀請室友，開始自動排班與獎勵機制。
      </p>
      <button 
        onClick={handleCreateGroup}
        className="w-full max-w-xs py-4 bg-[#28C8C8] text-white rounded-2xl font-bold shadow-xl shadow-[#28C8C8]/30 active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        <Plus size={20} /> 建立新空間
      </button>
    </div>
  );

  // 3. 主應用介面
  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 max-w-md mx-auto border-x overflow-hidden h-[100dvh]">
      
      {/* Header */}
      <header className="flex-none bg-white px-4 py-4 border-b flex justify-between items-center z-10">
        <div className="flex flex-col">
           <h1 className="font-bold text-gray-800 text-lg leading-tight">家事值日生</h1>
           <span className="text-[10px] text-gray-400 font-mono">ID: {groupId.split('-')[1]}</span>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 rounded-full pl-1 pr-3 py-1">
          <img src={currentUser?.avatar} className="w-6 h-6 rounded-full border border-white shadow-sm" alt="me" />
          <span className="text-xs font-bold text-gray-700 truncate max-w-[80px]">{currentUser?.name}</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        
        {/* VIEW: ROSTER (值日表) */}
        {view === 'roster' && (
          <div className="space-y-4 animate-fade-in">
            {/* 邀請與群組資訊區塊 */}
            <div className="bg-gradient-to-r from-[#28C8C8] to-[#20a0a0] rounded-2xl p-4 text-white shadow-lg shadow-[#28C8C8]/20 mb-2">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg">邀請室友</h3>
                  <p className="text-xs opacity-80">讓大家加入此群組一起分擔</p>
                </div>
                <div className="bg-white/20 p-2 rounded-lg">
                  <UserPlus size={20} />
                </div>
              </div>
              <button 
                onClick={shareInvite} 
                className="w-full bg-white text-[#28C8C8] py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                傳送連結給室友
              </button>
            </div>

            {/* 切換模式按鈕 */}
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button 
                onClick={() => setRosterViewMode('list')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}
              >
                <List size={16} /> 清單模式
              </button>
              <button 
                onClick={() => setRosterViewMode('calendar')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}
              >
                <CalendarDays size={16} /> 日曆模式
              </button>
            </div>

            {/* --- 清單模式內容 --- */}
            {rosterViewMode === 'list' && (
              <>
                {/* 我的待辦 (My Tasks) */}
                <div>
                  <div className="flex justify-between items-end mb-3 cursor-pointer group" onClick={() => setIsMyTasksOpen(!isMyTasksOpen)}>
                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-[#28C8C8]" /> 我的待辦
                      {isMyTasksOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </h3>
                  </div>
                  
                  {isMyTasksOpen && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all">
                      {(() => {
                        const myTasks = currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending');
                        if (myTasks.length === 0) return <div className="p-6 text-center text-gray-400 text-sm">目前沒有待辦事項 🎉</div>;
                        
                        return (
                          <div className="divide-y divide-gray-50">
                            {myTasks.map(task => (
                              <div key={task.id} className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">{task.icon}</span>
                                  <div>
                                    <h4 className="font-bold text-gray-800 text-sm">{task.name}</h4>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${task.date === getTodayString() ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-400'}`}>
                                      {task.date === getTodayString() ? '今天' : task.date}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => releaseTaskToBounty(task)} 
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 bg-gray-50 hover:bg-gray-100"
                                  >
                                    沒空
                                  </button>
                                  <button 
                                    disabled={isFutureDate(task.date)}
                                    onClick={() => completeTask(task)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm ${isFutureDate(task.date) ? 'bg-gray-200 cursor-not-allowed' : 'bg-[#28C8C8] hover:bg-[#20a0a0]'}`}
                                  >
                                    完成
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* 所有任務 (All Tasks) */}
                <div>
                  <div className="flex justify-between items-end mb-3 cursor-pointer group" onClick={() => setIsTaskListOpen(!isTaskListOpen)}>
                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                      <Users size={18} className="text-gray-400" /> 任務列表
                      {isTaskListOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </h3>
                  </div>

                  {isTaskListOpen && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all">
                      <div className="divide-y divide-gray-50">
                        {currentCycleTasks.length === 0 ? (
                          <div className="p-8 text-center text-gray-400">目前沒有排班任務</div>
                        ) : (
                          currentCycleTasks.map(task => {
                            const isMine = task.currentHolderId === currentUser?.id;
                            const isOpen = task.status === 'open';
                            const isDone = task.status === 'done';
                            
                            return (
                              <div key={task.id} className={`p-4 flex items-center justify-between ${isOpen ? 'bg-red-50/50' : ''}`}>
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${isDone ? 'opacity-30' : 'bg-gray-50'}`}>
                                    {task.icon}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className={`font-bold text-sm ${isDone ? 'text-gray-300 line-through' : 'text-gray-800'}`}>{task.name}</h4>
                                      {isOpen && <span className="text-[10px] bg-red-500 text-white px-1 rounded-sm font-bold animate-pulse">賞金</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] text-gray-400 font-mono">{task.date}</span>
                                      {!isDone && !isOpen && (
                                        <span className={`text-[10px] ${isMine ? 'text-[#28C8C8] font-bold' : 'text-gray-400'}`}>
                                          負責人: {users.find(u => u.id === task.currentHolderId)?.name || '未知'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {isOpen ? (
                                  <button 
                                    onClick={() => claimBountyTask(task)}
                                    className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm shadow-red-200"
                                  >
                                    接單 +${task.price}
                                  </button>
                                ) : isDone ? (
                                  <CheckCircle2 className="text-green-300" size={20} />
                                ) : isMine ? (
                                  <div className="w-2 h-2 rounded-full bg-[#28C8C8] animate-pulse"></div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                  {/* 測試按鈕：手動生成任務 (正式版需移除) */}
                  <div className="mt-4 text-center">
                    <button onClick={generateTestTasks} className="text-[10px] text-gray-300 underline">開發用：+1 測試任務</button>
                  </div>
                </div>
              </>
            )}

            {/* --- 日曆模式 (Calendar) --- */}
            {rosterViewMode === 'calendar' && (
              <div className="bg-white rounded-2xl p-4 border shadow-sm text-center py-20">
                <CalendarDays size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 text-sm">日曆視圖開發中...</p>
                <p className="text-[10px] text-gray-300 mt-2">Firebase 實時日曆組件串接中</p>
              </div>
            )}
          </div>
        )}

        {/* VIEW: WALLET (帳本) */}
        {view === 'wallet' && (
          <div className="animate-fade-in space-y-6">
            <div className="bg-gradient-to-br from-[#28C8C8] to-[#1facac] rounded-2xl p-6 text-white shadow-xl">
              <div className="flex justify-between items-start">
                 <div>
                   <p className="text-white/80 text-xs mb-1">我的目前結餘</p>
                   <h2 className="text-4xl font-bold font-mono">
                     {users.find(u => u.id === currentUser?.id)?.balance || 0}
                   </h2>
                 </div>
                 <div className="bg-white/20 p-2 rounded-lg"><Wallet className="text-white" /></div>
               </div>
            </div>
            
            <div>
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Users size={16} /> 室友餘額排行
              </h3>
              <div className="bg-white rounded-xl shadow-sm border divide-y">
                {users.map(u => (
                  <div key={u.id} className="p-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <img src={u.avatar} className="w-10 h-10 rounded-full border border-gray-100 bg-gray-200" alt={u.name} />
                      <span className="font-bold text-gray-700">{u.name} {u.id === currentUser?.id && '(我)'}</span>
                    </div>
                    <span className={`font-mono font-bold ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>
                      {u.balance > 0 ? '+' : ''}{u.balance}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW: SETTINGS (設定) */}
        {view === 'settings' && (
          <div className="animate-fade-in space-y-4">
            <div className="bg-white rounded-xl shadow-sm border p-4">
               <h3 className="font-bold text-gray-800 mb-4">系統資訊</h3>
               <div className="space-y-3 text-sm text-gray-600">
                 <div className="flex justify-between border-b pb-2">
                   <span>群組 ID</span>
                   <span className="font-mono text-gray-400">{groupId}</span>
                 </div>
                 <div className="flex justify-between border-b pb-2">
                   <span>總人數</span>
                   <span>{users.length} 人</span>
                 </div>
                 <div className="pt-2">
                    <button onClick={shareInvite} className="w-full py-2 bg-gray-50 text-[#28C8C8] font-bold rounded-lg border border-[#28C8C8]/20 hover:bg-[#28C8C8] hover:text-white transition-colors">
                      複製邀請連結
                    </button>
                 </div>
               </div>
            </div>
          </div>
        )}
      </main>

      {/* Tab Bar */}
      <nav className="bg-white border-t flex justify-around pb-6 pt-2 z-10 sticky bottom-0">
        <button onClick={() => setView('roster')} className={`flex flex-col items-center w-full py-2 ${view === 'roster' ? 'text-[#28C8C8]' : 'text-gray-400'}`}>
          <CalendarDays size={24} /><span className="text-[10px] mt-1 font-medium">值日表</span>
        </button>
        <button onClick={() => setView('wallet')} className={`flex flex-col items-center w-full py-2 ${view === 'wallet' ? 'text-[#28C8C8]' : 'text-gray-400'}`}>
          <Wallet size={24} /><span className="text-[10px] mt-1 font-medium">帳本</span>
        </button>
        <button onClick={() => setView('settings')} className={`flex flex-col items-center w-full py-2 ${view === 'settings' ? 'text-[#28C8C8]' : 'text-gray-400'}`}>
          <Settings size={24} /><span className="text-[10px] mt-1 font-medium">設定</span>
        </button>
      </nav>

    </div>
  );
}