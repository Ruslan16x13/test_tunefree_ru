import React, { useState, useEffect } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { useLibrary } from '../contexts/LibraryContext';
import { getImgReferrerPolicy } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { FolderIcon, PlusIcon, MusicIcon, SearchIcon, DownloadIcon, ShareIcon } from './Icons';

interface PlayerMorePopupProps {
  isOpen: boolean;
  onClose: () => void;
  onClosePlayer?: () => void;
}

const PlayerMorePopup: React.FC<PlayerMorePopupProps> = ({ isOpen, onClose, onClosePlayer }) => {
  const { currentSong, audioQuality, setAudioQuality } = usePlayer();
  const { playlists, addToPlaylist, createPlaylist } = useLibrary();
  const [showPlaylistSelect, setShowPlaylistSelect] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  // Блокировка скролла фона при открытии модала; сброс подсостояний при закрытии
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    } else {
      setShowPlaylistSelect(false);
      setNewPlaylistName('');
      setIsCreating(false);
    }
  }, [isOpen]);

  if (!isOpen || !currentSong) return null;

  const handleAddToPlaylist = (playlistId: string) => {
    addToPlaylist(playlistId, currentSong);
    onClose();
  };

  const handleCreateAndAdd = () => {
    if (newPlaylistName.trim()) {
      // Now createPlaylist accepts initialSongs
      createPlaylist(newPlaylistName, [currentSong]);
      onClose();
    }
  };

  const handleSearch = (keyword: string) => {
      onClose();
      // Use a small timeout to allow the popup to close smoothly before navigation
      setTimeout(() => {
          if (onClosePlayer) onClosePlayer();
          if (keyword) {
            navigate(`/search?q=${encodeURIComponent(keyword)}`);
          } else {
            navigate('/search');
          }
      }, 300);
  };

  const handleShare = async () => {
    if (!currentSong) return;
    
    const shareText = `Я нашёл крутой трек в TuneFree: ${currentSong.artist} - ${currentSong.name}, послушай!`;
    const shareUrl = window.location.origin;

    const shareData = {
        title: currentSong.name,
        text: shareText,
        url: shareUrl
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
            alert('Ссылка скопирована в буфер обмена');
        }
    } catch (e) {
        // ignore share cancellation
    }
    onClose();
  };

  const qualities = [
      { id: '128k', label: 'Стандарт', desc: '128k' },
      { id: '320k', label: 'Высокое', desc: '320k' },
      { id: 'flac', label: 'Lossless', desc: 'FLAC' },
      { id: 'flac24bit', label: 'Hi-Res', desc: '24bit' },
  ];

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm transition-opacity touch-auto"
        onClick={onClose}
        onPointerDown={e => e.stopPropagation()}
      />

      <div
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl z-[61] p-6 pb-safe shadow-2xl animate-slide-up max-h-[85vh] overflow-y-auto touch-auto transition-colors duration-300"
        onPointerDown={e => e.stopPropagation()}
      >
        
        {/* Header Song Info */}
        <div className="flex items-center space-x-3 mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                {currentSong.pic ? (
                    <img src={currentSong.pic} referrerPolicy={getImgReferrerPolicy(currentSong.pic)} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                        <MusicIcon size={24} />
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg truncate dark:text-white">{currentSong.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{currentSong.artist}</p>
            </div>
        </div>

        {!showPlaylistSelect ? (
            <div className="space-y-4">
                {/* Audio Quality Selection */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">Онлайн воспроизведение</h4>
                    <div className="flex bg-white dark:bg-gray-700 p-1 rounded-lg shadow-sm dark:shadow-none">
                        {qualities.map(q => (
                            <button
                                key={q.id}
                                onClick={() => setAudioQuality(q.id as any)}
                                className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${
                                    audioQuality === q.id 
                                    ? 'bg-black dark:bg-white text-white dark:text-black shadow-md' 
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                                }`}
                            >
                                {q.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <button 
                        onClick={() => setShowPlaylistSelect(true)}
                        className="w-full flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition active:scale-[0.98]"
                    >
                        <div className="p-2 bg-white dark:bg-gray-700 rounded-full text-ios-red shadow-sm dark:shadow-none">
                            <FolderIcon size={20} />
                        </div>
                        <span className="font-medium text-gray-800 dark:text-gray-200">Добавить в плейлист...</span>
                    </button>

                    <button 
                        onClick={handleShare}
                        className="w-full flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition active:scale-[0.98]"
                    >
                        <div className="p-2 bg-white dark:bg-gray-700 rounded-full text-ios-red shadow-sm dark:shadow-none">
                            <ShareIcon size={20} />
                        </div>
                        <span className="font-medium text-gray-800 dark:text-gray-200">Поделиться треком</span>
                    </button>
                </div>

                 <div className="grid grid-cols-2 gap-2 mt-2">
                    <button 
                        onClick={() => currentSong.artist && handleSearch(currentSong.artist)}
                        disabled={!currentSong.artist}
                        className={`flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition active:scale-[0.98] ${!currentSong.artist ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <SearchIcon size={24} className="mb-2 text-gray-500 dark:text-gray-400" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Найти исполнителя</span>
                    </button>
                    <button 
                        onClick={() => currentSong.album && handleSearch(currentSong.album)}
                        disabled={!currentSong.album}
                        className={`flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition active:scale-[0.98] ${!currentSong.album ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <SearchIcon size={24} className="mb-2 text-gray-500 dark:text-gray-400" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Найти альбом</span>
                    </button>
                </div>

                <button 
                    onClick={onClose}
                    className="w-full py-4 mt-2 text-center font-bold text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl active:bg-gray-50 dark:active:bg-gray-700 transition-colors duration-300"
                >
                    Отмена
                </button>
            </div>
        ) : (
            <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-gray-800 dark:text-white">Выбрать плейлист</h4>
                    <button onClick={() => setShowPlaylistSelect(false)} className="text-xs text-ios-red font-medium">Назад</button>
                </div>
                
                <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-2">
                    {/* Create New Inline */}
                    {!isCreating ? (
                         <button 
                            onClick={() => setIsCreating(true)}
                            className="w-full flex items-center space-x-3 p-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 hover:border-ios-red hover:text-ios-red transition"
                        >
                            <PlusIcon size={20} />
                            <span className="font-medium text-sm">Новый плейлист</span>
                        </button>
                    ) : (
                        <div className="flex items-center space-x-2 p-1">
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="Название плейлиста" 
                                className="flex-1 bg-gray-100 dark:bg-gray-800 dark:text-white p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-red/20"
                                value={newPlaylistName}
                                onChange={e => setNewPlaylistName(e.target.value)}
                            />
                            <button 
                                onClick={handleCreateAndAdd}
                                className="p-3 bg-ios-red text-white rounded-xl font-medium text-sm"
                            >
                                Создать
                            </button>
                        </div>
                    )}

                    {playlists.map(p => (
                        <button 
                            key={p.id}
                            onClick={() => handleAddToPlaylist(p.id)}
                            className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition active:scale-[0.98]"
                        >
                            <div className="flex items-center space-x-3">
                                <FolderIcon size={20} className="text-ios-red" />
                                <div className="text-left">
                                    <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{p.name}</p>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{p.songs.length} треков</p>
                                </div>
                            </div>
                            {p.songs.find(s => String(s.id) === String(currentSong.id)) && (
                                <span className="text-[10px] bg-ios-red/10 text-ios-red px-2 py-0.5 rounded-full">Добавлено</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        )}
      </div>
    </>
  );
};

export default PlayerMorePopup;
