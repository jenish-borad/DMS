import { useState, useEffect } from 'react';
import { api } from './api';
import Auth from './components/Auth';
import Search from './components/Search';
import DocumentList from './components/DocumentList';
import UploadModal from './components/UploadModal';
import DocumentModal from './components/DocumentModal';

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  // Navigation: 'search' or 'repository'
  const [activeTab, setActiveTab] = useState('search');

  // Modals state
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  
  // Cache buster for DocumentList updates
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // In-app Notification Banner state (Blocks native alert/confirm dialogues)
  const [toast, setToast] = useState({ show: false, message: '', isError: false });

  const showToast = (message, isError = false) => {
    setToast({ show: true, message, isError });
    setTimeout(() => {
      setToast({ show: false, message: '', isError: false });
    }, 4000);
  };

  // Check login state on application mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await api.auth.me();
        if (response && response.data) {
          setUser(response.data);
          setIsAuthenticated(true);
        }
      } catch (err) {
        // Suppress 401 console logging of user credentials / tokens as per security policies
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setCheckingAuth(false);
      }
    };
    checkSession();
  }, []);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    showToast(`Welcome back, ${userData.fullName || userData.username}!`);
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
      setUser(null);
      setIsAuthenticated(false);
      
      // Clear memory caches and trigger full reload on logout to protect against session leaks
      window.location.reload();
    } catch (err) {
      showToast('Logout failed. Please try again.', true);
    }
  };

  // Modal handlers
  const handleOpenDocument = (id) => {
    setSelectedDocId(id);
  };

  const handleCloseDocument = () => {
    setSelectedDocId(null);
  };

  const handleOpenUpload = () => {
    setIsUploadOpen(true);
  };

  const handleCloseUpload = () => {
    setIsUploadOpen(false);
  };

  const handleUploadSuccess = () => {
    setIsUploadOpen(false);
    setRefreshTrigger(prev => prev + 1);
    showToast('Document ingested and text indices generated successfully.');
  };

  const handleRefreshRepository = () => {
    setRefreshTrigger(prev => prev + 1);
    showToast('Document parameters updated.');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fafafa]">
        <div className="w-12 h-12 border-2 border-black border-t-transparent animate-spin rounded-full mb-4"></div>
        <div className="font-mono text-xs uppercase text-zinc-500 tracking-widest">
          Checking Security Tokens...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col">
      
      {/* Toast Notification Banner */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in max-w-sm">
          <div className={`border border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono text-xs uppercase flex items-start gap-2 ${
            toast.isError ? 'bg-black text-white' : 'bg-white text-black'
          }`}>
            <span className="font-bold">{toast.isError ? '/!/' : '>>'}</span>
            <div>{toast.message}</div>
          </div>
        </div>
      )}

      {/* Main App Navigation Bar */}
      <header className="bg-white border-b border-black py-4 px-6 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-black tracking-tighter uppercase font-mono border-2 border-black px-2.5 py-1">
              DMS
            </h1>
            <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest hidden md:inline">
              // Doc Manager & Search
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex border border-black font-mono text-xs">
              <button
                onClick={() => setActiveTab('search')}
                className={`px-4 py-2 uppercase transition-monochrome select-none cursor-pointer border-r border-black ${
                  activeTab === 'search' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'
                }`}
              >
                Search Engine
              </button>
              <button
                onClick={() => setActiveTab('repository')}
                className={`px-4 py-2 uppercase transition-monochrome select-none cursor-pointer ${
                  activeTab === 'repository' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'
                }`}
              >
                Repository
              </button>
            </div>

            <div className="flex items-center gap-3 border-l border-zinc-200 pl-4 font-mono text-xs">
              <span className="text-zinc-500 uppercase">
                User: <span className="font-bold text-black">{user?.username}</span>
              </span>
              <button
                onClick={handleLogout}
                className="border border-black px-2.5 py-1.5 uppercase hover:bg-zinc-100 transition-monochrome cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-4">
        {activeTab === 'search' ? (
          <Search onSelectDocument={handleOpenDocument} currentUser={user} />
        ) : (
          <DocumentList
            onSelectDocument={handleOpenDocument}
            onOpenUpload={handleOpenUpload}
            refreshTrigger={refreshTrigger}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-zinc-200 text-center font-mono text-[9px] uppercase tracking-widest text-zinc-400">
        DMS // SECURE DOCUMENT INDEXING SYSTEM &copy; {new Date().getFullYear()}
      </footer>

      {/* Upload/Creation Modal */}
      {isUploadOpen && (
        <UploadModal
          onClose={handleCloseUpload}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* View/Edit Details Modal */}
      {selectedDocId && (
        <DocumentModal
          documentId={selectedDocId}
          currentUser={user}
          onClose={handleCloseDocument}
          onUpdateSuccess={handleRefreshRepository}
        />
      )}

    </div>
  );
}
