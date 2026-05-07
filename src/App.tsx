import React, { useState, useEffect, useCallback } from 'react';
import { 
  FolderPlus, 
  Link as LinkIcon, 
  Settings, 
  Trash2, 
  Edit3, 
  ChevronRight, 
  ExternalLink,
  Plus,
  X,
  Folder as FolderIcon,
  LayoutGrid,
  Eye,
  Github,
  Moon,
  Sun,
  Palette,
  ArrowLeft,
  LogOut,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Config, Folder, Link } from './types';
import { useAuth } from './context/AuthContext';
import { Auth } from './components/Auth';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

const STORAGE_KEY = 'linkhub_config';

const DEFAULT_CONFIG: Config = {
  folders: [
    {
      id: '1',
      title: 'Học tập',
      icon: 'BookOpen',
      links: [
        { id: '1-1', label: 'Google Search', url: 'https://google.com' },
        { id: '1-2', label: 'Wikipedia', url: 'https://wikipedia.org' }
      ],
      folders: [],
      color: '#3B82F6'
    },
    {
      id: '2',
      title: 'Work',
      icon: 'Briefcase',
      links: [
        { id: '2-1', label: 'GitHub', url: 'https://github.com' },
        { id: '2-2', label: 'Notion', url: 'https://notion.so' }
      ],
      folders: [
        {
          id: '2-3',
          title: 'Dự án A',
          icon: 'Folder',
          links: [
            { id: '2-3-1', label: 'Tài liệu', url: 'https://docs.google.com' }
          ],
          folders: [],
          color: '#10B981'
        }
      ],
      color: '#10B981'
    }
  ],
  appearance: {
    theme: 'glass',
    displayName: 'DXO summary'
  }
};

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [isEditMode, setIsEditMode] = useState(false);
  const [navigationPath, setNavigationPath] = useState<string[]>([]); // Array of Folder IDs
  const [isSyncing, setIsSyncing] = useState(false);

  // Load config from Firestore
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    
    // Initial fetch to check if doc exists
    const initFetch = async () => {
      try {
        const snap = await getDoc(userDocRef);
        if (!snap.exists()) {
          // Initialize for new user
          await setDoc(userDocRef, {
            ...DEFAULT_CONFIG,
            userId: user.uid,
            updatedAt: serverTimestamp()
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }
    };

    initFetch();

    // Listen for real-time updates
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // Ensure folders have recursive structure
        const migrate = (folders: Folder[]): Folder[] => (folders || []).map(f => ({
          ...f,
          folders: f.folders || [],
          links: f.links || []
        }));
        
        setConfig({
          folders: migrate(data.folders),
          appearance: data.appearance || DEFAULT_CONFIG.appearance
        });
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    });

    return unsubscribe;
  }, [user]);

  // Save config to Firestore
  const saveToFirebase = useCallback(async (newConfig: Config) => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        ...newConfig,
        userId: user.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  // Helper to update config and sync
  const updateConfig = useCallback((updater: (prev: Config) => Config) => {
    setConfig(prev => {
      const next = updater(prev);
      saveToFirebase(next);
      return next;
    });
  }, [saveToFirebase]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Đang tải cấu hình...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Auth />
      </div>
    );
  }

  // Recursively find and update folders
  const updateFoldersInTree = (folders: Folder[], targetId: string, updater: (f: Folder) => Folder): Folder[] => {
    return folders.map(folder => {
      if (folder.id === targetId) {
        return updater(folder);
      }
      if (folder.folders && folder.folders.length > 0) {
        return { ...folder, folders: updateFoldersInTree(folder.folders, targetId, updater) };
      }
      return folder;
    });
  };

  const removeFolderFromTree = (folders: Folder[], targetId: string): Folder[] => {
    return folders.filter(f => f.id !== targetId).map(f => ({
      ...f,
      folders: f.folders ? removeFolderFromTree(f.folders, targetId) : []
    }));
  };

  const getCurrentLevelFolders = (): Folder[] => {
    let current = config.folders;
    for (const id of navigationPath) {
      const found = current.find(f => f.id === id);
      if (found && found.folders) {
        current = found.folders;
      } else {
        return [];
      }
    }
    return current;
  };

  const getBreadcrumbs = () => {
    const breadcrumbs: { id: string | null, title: string }[] = [{ id: null, title: 'Gốc' }];
    let current = config.folders;
    for (const id of navigationPath) {
      const found = current.find(f => f.id === id);
      if (found) {
        breadcrumbs.push({ id: found.id, title: found.title });
        current = found.folders || [];
      }
    }
    return breadcrumbs;
  };

  const activeFolderId = navigationPath[navigationPath.length - 1] || null;
  const activeFolder = ((): Folder | null => {
    if (!activeFolderId) return null;
    const find = (folders: Folder[], id: string): Folder | null => {
      for (const f of folders) {
        if (f.id === id) return f;
        if (f.folders) {
          const res = find(f.folders, id);
          if (res) return res;
        }
      }
      return null;
    };
    return find(config.folders, activeFolderId);
  })();

  const addFolder = (parentId: string | null = null) => {
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      title: 'Thư mục mới',
      icon: 'Folder',
      links: [],
      folders: [],
      color: activeFolder?.color || '#6366F1'
    };

    updateConfig(prev => {
      if (!parentId) {
        return { ...prev, folders: [...prev.folders, newFolder] };
      } else {
        return {
          ...prev,
          folders: updateFoldersInTree(prev.folders, parentId, (f) => ({
            ...f,
            folders: [...(f.folders || []), newFolder]
          }))
        };
      }
    });

    // Automatically navigate to new folder if added at current level
    if (parentId === activeFolderId) {
      setNavigationPath(prev => [...prev, newFolder.id]);
    }
  };

  const updateFolder = (id: string, updates: Partial<Folder>) => {
    updateConfig(prev => ({
      ...prev,
      folders: updateFoldersInTree(prev.folders, id, (f) => ({ ...f, ...updates }))
    }));
  };

  const removeFolder = (id: string) => {
    updateConfig(prev => ({
      ...prev,
      folders: removeFolderFromTree(prev.folders, id)
    }));
    // If we are in the folder being removed, go up
    if (navigationPath.includes(id)) {
      const idx = navigationPath.indexOf(id);
      setNavigationPath(navigationPath.slice(0, idx));
    }
  };

  const addLink = (folderId: string) => {
    const newLink: Link = {
      id: crypto.randomUUID(),
      label: 'Liên kết mới',
      url: 'https://'
    };
    updateConfig(prev => ({
      ...prev,
      folders: updateFoldersInTree(prev.folders, folderId, (f) => ({
        ...f,
        links: [...f.links, newLink]
      }))
    }));
  };

  const updateLink = (folderId: string, linkId: string, updates: Partial<Link>) => {
    updateConfig(prev => ({
      ...prev,
      folders: updateFoldersInTree(prev.folders, folderId, (f) => ({
        ...f,
        links: f.links.map(l => l.id === linkId ? { ...l, ...updates } : l)
      }))
    }));
  };

  const removeLink = (folderId: string, linkId: string) => {
    updateConfig(prev => ({
      ...prev,
      folders: updateFoldersInTree(prev.folders, folderId, (f) => ({
        ...f,
        links: f.links.filter(l => l.id !== linkId)
      }))
    }));
  };

  const navigateTo = (pathId: string | null) => {
    if (!pathId) {
      setNavigationPath([]);
      return;
    }
    const idx = navigationPath.indexOf(pathId);
    if (idx !== -1) {
      setNavigationPath(navigationPath.slice(0, idx + 1));
    } else {
      setNavigationPath(prev => [...prev, pathId]);
    }
  };

  return (
    <div className={cn(
      "min-h-screen transition-all duration-500 font-sans flex flex-col",
      config.appearance.theme === 'dark' ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900",
      config.appearance.theme === 'glass' && "bg-gradient-to-br from-indigo-50 to-blue-100"
    )}>
      {/* Background decoration for glass theme */}
      {config.appearance.theme === 'glass' && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/20 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/20 blur-[120px] rounded-full" />
        </div>
      )}

      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/50 backdrop-blur-md bg-white/30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { setNavigationPath([]); setIsEditMode(false); }}
            className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 hover:scale-105 transition-transform"
          >
            <LayoutGrid className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isEditMode ? "Cấu hình Thư mục" : config.appearance.displayName}
            </h1>
            {/* Breadcrumbs for easier navigation */}
            <nav className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 overflow-x-auto whitespace-nowrap">
              {getBreadcrumbs().map((bc, idx) => (
                <React.Fragment key={bc.id || 'root'}>
                  {idx > 0 && <ChevronRight className="w-3 h-3 mx-1" />}
                  <button 
                    onClick={() => navigateTo(bc.id)}
                    className="hover:text-indigo-600 transition-colors"
                  >
                    {bc.title}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-xs font-bold text-slate-900 truncate max-w-[150px]">
              {user.displayName || user.email}
            </span>
            <button 
              onClick={() => signOut(auth)}
              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase"
            >
              Đăng xuất
            </button>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200 overflow-hidden">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <UserIcon className="w-5 h-5" />
            )}
          </div>
          <button 
            onClick={() => setIsEditMode(!isEditMode)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm",
              isEditMode 
                ? "bg-slate-900 text-white hover:bg-slate-800" 
                : "bg-white text-slate-700 shadow-sm border border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
            )}
          >
            {isEditMode ? (
              <><Eye className="w-4 h-4" /> Xem kết quả</>
            ) : (
              <><Settings className="w-4 h-4" /> Cấu hình</>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-12 w-full flex-1">
        {isEditMode ? (
          <div className="flex flex-col gap-8">
            {/* Current Level Editor */}
            <div className="bg-white/70 backdrop-blur-xl border border-white/40 p-8 rounded-[40px] shadow-xl shadow-slate-200/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-6 border-b border-slate-100">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                      <FolderIcon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Đang chỉnh sửa</label>
                      </div>
                      <input 
                        type="text" 
                        value={activeFolder?.title || "Gốc (Root)"}
                        readOnly={!activeFolder}
                        onChange={(e) => activeFolder && updateFolder(activeFolder.id, { title: e.target.value })}
                        className={cn(
                          "bg-transparent text-3xl font-black focus:outline-none w-full",
                          !activeFolder && "opacity-50"
                        )}
                        placeholder="Tiêu đề thư mục"
                      />
                    </div>
                  </div>
                </div>
                {activeFolder && (
                  <div className="flex items-center gap-3">
                    <input 
                      type="color" 
                      value={activeFolder.color}
                      onChange={(e) => updateFolder(activeFolder.id, { color: e.target.value })}
                      className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0 shadow-sm"
                    />
                    <button 
                      onClick={() => removeFolder(activeFolder.id)}
                      className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-red-50"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Sub-folders section */}
                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-bold text-slate-800 text-lg">
                      <FolderPlus className="w-5 h-5 text-indigo-500" /> Thư mục con
                    </h3>
                    <button 
                      onClick={() => addFolder(activeFolderId)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                    >
                      <Plus className="w-3 h-3" /> Thêm thư mục
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {getCurrentLevelFolders().length === 0 ? (
                      <div className="py-8 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
                        <p className="text-slate-400 text-sm">Chưa có thư mục con nào</p>
                      </div>
                    ) : (
                      getCurrentLevelFolders().map(folder => (
                        <div 
                          key={folder.id} 
                          className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 hover:border-indigo-200 transition-all group"
                        >
                          <button 
                            onClick={() => navigateTo(folder.id)}
                            className="flex items-center gap-3 flex-1 text-left"
                          >
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: folder.color }} />
                            <span className="font-semibold text-slate-700">{folder.title}</span>
                          </button>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                                onClick={() => removeFolder(folder.id)}
                                className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                             >
                                <X className="w-4 h-4" />
                             </button>
                             <button 
                                onClick={() => navigateTo(folder.id)}
                                className="p-2 text-indigo-500 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                             >
                                <ChevronRight className="w-4 h-4" />
                             </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* Links section */}
                <section className="space-y-6">
                  {activeFolder ? (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-bold text-slate-800 text-lg">
                          <LinkIcon className="w-5 h-5 text-indigo-500" /> Các liên kết
                        </h3>
                        <button 
                          onClick={() => addLink(activeFolder.id)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-all"
                        >
                          <Plus className="w-3 h-3" /> Thêm link
                        </button>
                      </div>

                      <div className="space-y-4">
                        {activeFolder.links.length === 0 ? (
                          <div className="py-8 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
                            <p className="text-slate-400 text-sm">Chưa có liên kết nào</p>
                          </div>
                        ) : (
                          activeFolder.links.map(link => (
                            <div key={link.id} className="p-4 rounded-2xl bg-slate-50/50 border border-transparent hover:border-slate-100 hover:bg-white transition-all group">
                              <div className="flex gap-4">
                                <div className="flex-1 space-y-3">
                                  <input 
                                    type="text" 
                                    value={link.label}
                                    onChange={(e) => updateLink(activeFolder.id, link.id, { label: e.target.value })}
                                    className="w-full bg-transparent border-0 focus:ring-0 font-bold text-slate-800 p-0 text-lg placeholder:text-slate-300"
                                    placeholder="Tên link"
                                  />
                                  <input 
                                    type="text" 
                                    value={link.url}
                                    onChange={(e) => updateLink(activeFolder.id, link.id, { url: e.target.value })}
                                    className="w-full bg-transparent border-0 focus:ring-0 text-xs font-mono text-slate-400 p-0 placeholder:text-slate-200"
                                    placeholder="https://..."
                                  />
                                </div>
                                <button 
                                  onClick={() => removeLink(activeFolder.id, link.id)}
                                  className="self-start p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-slate-50/30 rounded-3xl border-2 border-dashed border-slate-100">
                        <p className="text-slate-400 italic text-sm text-center px-8">
                          Chọn hoặc tạo một thư mục con để thêm các liên kết vào bên trong.
                        </p>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        ) : (
          /* Viewer Mode */
          <div className="space-y-12">
            <AnimatePresence mode="wait">
              <motion.div 
                key={activeFolderId || 'root'}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-12"
              >
                <header className="text-center max-w-2xl mx-auto space-y-4">
                    <h2 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
                      {activeFolder ? activeFolder.title : "Xin chào mừng!"}
                    </h2>
                    <p className="text-lg text-slate-500">
                      {activeFolder ? `Bạn đang ở trong thư mục ${activeFolder.title}.` : "Khám phá các tài nguyên đã lưu trữ của bạn."}
                    </p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {/* Folders first */}
                  {getCurrentLevelFolders().map((folder, index) => (
                    <motion.button
                      key={folder.id}
                      onClick={() => navigateTo(folder.id)}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group text-left"
                    >
                      <div className="h-full bg-white/40 backdrop-blur-md rounded-[40px] p-8 border border-white hover:border-indigo-100 shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 flex flex-col min-h-[220px]">
                        <div className="flex items-center justify-between mb-6">
                          <div 
                            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110 duration-500"
                            style={{ backgroundColor: folder.color || '#3B82F6' }}
                          >
                            <FolderIcon className="w-8 h-8" />
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 mb-2">{folder.title}</h3>
                        <div className="mt-auto flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
                          <span>{(folder.folders?.length || 0) + (folder.links?.length || 0)} mục</span>
                        </div>
                      </div>
                    </motion.button>
                  ))}

                  {/* Links next */}
                  {activeFolder?.links.map((link, index) => (
                    <motion.a 
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (getCurrentLevelFolders().length + index) * 0.05 }}
                      className="group"
                    >
                      <div className="h-full bg-white/60 hover:bg-white rounded-[40px] p-8 border border-slate-100 hover:border-indigo-100 shadow-lg shadow-slate-200/20 hover:shadow-xl transition-all duration-300 flex flex-col min-h-[220px]">
                        <div className="flex items-center justify-between mb-6">
                           <div className="w-14 h-14 bg-slate-50 flex items-center justify-center rounded-2xl group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                              <ExternalLink className="w-6 h-6" />
                           </div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2 truncate group-hover:text-indigo-600 transition-colors">
                          {link.label}
                        </h3>
                        <p className="text-xs font-mono text-slate-400 opacity-60 truncate mt-auto">
                          {link.url.replace(/^https?:\/\//, '')}
                        </p>
                      </div>
                    </motion.a>
                  ))}

                  {getCurrentLevelFolders().length === 0 && (!activeFolder || activeFolder.links.length === 0) && (
                    <div className="col-span-full py-20 text-center flex flex-col items-center gap-4">
                      <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-300">
                         <FolderIcon className="w-10 h-10" />
                      </div>
                      <p className="text-slate-400 italic font-medium">Thư mục này còn trống.</p>
                      {!activeFolderId && (
                        <button 
                          onClick={() => setIsEditMode(true)}
                          className="text-indigo-600 font-bold hover:underline"
                        >
                          Nhấp để bắt đầu cấu hình
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>


      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200/50 p-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <span>© {new Date().getFullYear()} LinkHub</span>
            <span className="opacity-30">•</span>
            <span>Tối ưu cho công việc và học tập</span>
          </div>
          <div className="flex items-center gap-6">
            <button className="text-slate-400 hover:text-indigo-600 transition-colors">
              <Github className="w-5 h-5" />
            </button>
            <div className="h-4 w-[1px] bg-slate-200" />
            <div className="flex items-center gap-1">
              {[ Sun, Moon, Palette ].map((Icon, idx) => (
                <button 
                   key={idx}
                   onClick={() => updateConfig(prev => ({ 
                     ...prev, 
                     appearance: { ...prev.appearance, theme: idx === 0 ? 'light' : idx === 1 ? 'dark' : 'glass' } 
                   }))}
                   className={cn(
                     "p-2 rounded-lg transition-colors",
                     ((config.appearance.theme === 'light' && idx === 0) || 
                      (config.appearance.theme === 'dark' && idx === 1) || 
                      (config.appearance.theme === 'glass' && idx === 2))
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-slate-400 hover:bg-slate-100"
                   )}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
