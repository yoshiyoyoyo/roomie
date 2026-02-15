import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, serverTimestamp, update, onValue } from "firebase/database";
import { 
  Plus, Home, ChevronRight, Users, CheckCircle2, 
  Wallet, Settings, History, LogOut, Loader2, X, RefreshCw
} from 'lucide-react';

// --- 配置區 ---
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('正在連接服務...');
  const [user, setUser] = useState(null);
  const [myGroups, setMyGroups] = useState([]);
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [view, setView] = useState('roster');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    // 🚀 動態載入 LINE SDK 的強效邏輯
    const loadLiffSDK = () => {
      return new Promise((resolve) => {
        if (window.liff) return resolve(window.liff);
        const script = document.createElement('script');
        script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
        script.async = true;
        script.onload = () => resolve(window.liff);
        document.head.appendChild(script);
      });
    };

    const startApp = async () => {
      try {
        setLoadingStatus('載入 LINE SDK...');
        const liff = await loadLiffSDK();
        
        setLoadingStatus('正在登入 LINE...');
        await liff.init({ liffId: LIFF_ID });
        
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        setUser({ id: profile.userId, name: profile.displayName, avatar: profile.pictureUrl });
        
        // 讀取本地歷史
        const saved = JSON.parse(localStorage.getItem('roomie_history') || '[]');
        setMyGroups(saved);

        // 檢查 URL 參數
        const params = new URLSearchParams(window.location.search);
        const gId = params.get('g');

        if (gId) {
          setLoadingStatus('正在進入空間...');
          await loadGroup(gId, profile.userId, profile.displayName, profile.pictureUrl);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        setLoadingStatus('啟動失敗，請重新整理');
      }
    };

    startApp();
  }, []);

  const loadGroup = async (gId, uId, uName, uAvatar) => {
    try {
      const groupRef = ref(db, `groups/${gId}`);
      const snapshot = await get(groupRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        setGroupData(data);
        setCurrentGroupId(gId);
        
        // 紀錄歷史
        const history = JSON.parse(localStorage.getItem('roomie_history') || '[]');
        if (!history.find(h => h.id === gId)) {
          const newHistory = [{ id: gId, name: data.name || '未命名空間' }, ...history].slice(0, 5);
          localStorage.setItem('roomie_history', JSON.stringify(newHistory));
          setMyGroups(newHistory);
        }

        // 檢查成員身分
        if (!data.members || !data.members[uId]) {
          await update(ref(db, `groups/${gId}/members/${uId}`), {
            id: uId, name: uName, avatar: uAvatar, balance: 0
          });
        }
        onValue(groupRef, (snap) => setGroupData(snap.val()));
        setLoading(false);
      } else {
        alert("找不到此群組");
        window.location.href = `https://liff.line.me/${LIFF_ID}`;
      }
    } catch (e) {
      alert("資料讀取失敗");
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setLoading(true);
    const newId = `g-${Math.random().toString(36).substr(2, 9)}`;
    try {
      const newGroupData = {
        id: newId,
        name: newGroupName,
        createdAt: serverTimestamp(),
        members: {
          [user.id]: { id: user.id, name: user.name, avatar: user.avatar, balance: 0 }
        },
        logs: [{ time: new Date().toLocaleString(), msg: `🏠 ${user.name} 建立了空間` }]
      };
      await set(ref(db, `groups/${newId}`), newGroupData);
      window.location.href = `https://liff.line.me/${LIFF_ID}?g=${newId}`;
    } catch (e) {
      alert("建立失敗，請檢查 Firebase 規則");
      setLoading(false);
    }
  };

  // --- 畫面渲染 ---

  if (loading) return (
    <div className="flex h-[100dvh] flex-col items-center justify-center bg-white">
      <div className="relative mb-6">
        <div className="w-16 h-16 border-4 border-cyan-100 border-t-cyan-500 rounded-full animate-spin"></div>
        <Home className="absolute inset-0 m-auto text-cyan-500" size={24} />
      </div>
      <p className="text-gray-500 font-bold animate-pulse">{loadingStatus}</p>
      <button onClick={() => window.location.reload()} className="mt-10 text-xs text-gray-400 underline">手動刷新</button>
    </div>
  );

  if (!currentGroupId) return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col">
      <header className="p-8 bg-white border-b">
        <h1 className="text-2xl font-bold text-gray-800">嗨，{user?.name}</h1>
        <p className="text-gray-500 text-sm">選擇空間或建立一個新的</p>
      </header>
      <div className="flex-1 p-6 space-y-4">
        {myGroups.map(g => (
          <div key={g.id} onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}?g=${g.id}`}
               className="bg-white p-5 rounded-3xl border border-gray-100 flex justify-between items-center shadow-sm active:scale-95 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center text-cyan-600"><Home size={24}/></div>
              <span className="font-bold text-gray-700">{g.name}</span>
            </div>
            <ChevronRight className="text-gray-300" />
          </div>
        ))}
        {myGroups.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="text-gray-300" size={32} />
            </div>
            <p className="text-gray-400 text-sm">目前沒有任何空間</p>
          </div>
        )}
      </div>
      <div className="p-6 bg-white border-t sticky bottom-0">
        <button onClick={() => setShowCreateModal(true)} className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-bold shadow-lg shadow-cyan-200 flex items-center justify-center gap-2">
          <Plus size={20}/> 建立新空間
        </button>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-8 space-y-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xl text-gray-800">為你的空間命名</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 bg-gray-100 rounded-full"><X size={20} /></button>
            </div>
            <input autoFocus name="groupName" type="text" placeholder="我的溫馨小家" 
                   value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                   className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-cyan-500 focus:bg-white outline-none transition-all text-lg" />
            <button onClick={handleCreateGroup} className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-bold text-lg">確認建立</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col pb-24 overflow-hidden">
      <header className="p-4 bg-white border-b flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2" onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}`}>
          <div className="p-1 bg-gray-50 rounded-full"><ChevronRight className="rotate-180 text-gray-400" size={20} /></div>
          <h2 className="font-bold text-gray-800 truncate max-w-[180px]">{groupData?.name}</h2>
        </div>
        <img src={user?.avatar} className="w-9 h-9 rounded-full border-2 border-cyan-50" alt="me" />
      </header>

      <main className="p-4 flex-1">
        {view === 'roster' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2 text-gray-700">成員名單</h3>
                <button onClick={async () => {
                  const link = `https://liff.line.me/${LIFF_ID}?g=${currentGroupId}`;
                  if (window.liff.isApiAvailable('shareTargetPicker')) {
                    await window.liff.shareTargetPicker([{ type: "text", text: `🏠 邀請你加入空間「${groupData.name}」！\n${link}` }]);
                  }
                }} className="text-xs text-cyan-500 font-bold bg-cyan-50 px-4 py-2 rounded-full">+ 邀請</button>
              </div>
              <div className="flex -space-x-3">
                {groupData?.members && Object.values(groupData.members).map(m => (
                  <div key={m.id} className="relative">
                    <img src={m.avatar} className="w-12 h-12 rounded-full border-2 border-white shadow-sm" alt={m.name} />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 flex flex-col items-center justify-center text-gray-400 space-y-3">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                <CheckCircle2 size={32} className="opacity-20" />
              </div>
              <p className="text-sm font-bold">目前無任務</p>
            </div>
          </div>
        )}

        {view === 'wallet' && (
          <div className="bg-cyan-500 p-8 rounded-[40px] text-white shadow-xl shadow-cyan-100 relative overflow-hidden">
            <div className="relative z-10">
              <p className="opacity-70 text-sm font-bold mb-1">我的結餘</p>
              <h1 className="text-5xl font-bold font-mono">NT$ {groupData?.members?.[user.id]?.balance || 0}</h1>
            </div>
            <Wallet className="absolute -right-4 -bottom-4 text-white opacity-10" size={120} />
          </div>
        )}

        {view === 'history' && (
          <div className="bg-white rounded-3xl border border-gray-100 p-6 space-y-4">
            <h3 className="font-bold text-gray-700">最近動態</h3>
            <div className="space-y-6">
              {groupData?.logs?.slice(-8).reverse().map((log, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-1.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400 font-mono mb-1">{log.time}</p>
                    <p className="text-sm text-gray-700 leading-snug">{log.msg}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-4">
             <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
               <h3 className="font-bold text-gray-800 mb-6">空間設定</h3>
               <button onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}`} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-bold flex items-center justify-center gap-2 active:bg-red-100 transition-colors">
                 <LogOut size={18}/> 退出並切換空間
               </button>
             </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t flex justify-around p-3 max-w-md mx-auto z-20">
        {[ {id:'roster', icon:CheckCircle2, label:'任務'}, {id:'wallet', icon:Wallet, label:'帳本'}, {id:'history', icon:History, label:'動態'}, {id:'settings', icon:Settings, label:'設定'} ].map(item => (
          <button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center p-2 rounded-2xl transition-all ${view === item.id ? 'text-cyan-600' : 'text-gray-400'}`}>
            <item.icon size={22} />
            <span className="text-[10px] mt-1 font-bold">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}