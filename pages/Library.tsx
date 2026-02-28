import React, { useState, useMemo, useCallback } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { useLibrary } from '../contexts/LibraryContext';
import { useTheme } from '../contexts/ThemeContext';
import { getImgReferrerPolicy } from '../services/api';
import { Song } from '../types';
import { HeartFillIcon, FolderIcon, PlusIcon, TrashIcon, SettingsIcon, DownloadIcon, UploadIcon, MusicIcon, InfoIcon, ExternalLinkIcon, GithubIcon, SunIcon, MoonIcon } from '../components/Icons';

type Tab = 'favorites' | 'playlists' | 'manage' | 'about';

// ====== Легковесный Toast (замена alert) ======
const useToast = () => {
    const [toast, setToast] = useState<string | null>(null);
    const show = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2200);
    }, []);
    const ToastUI = useMemo(() => {
        if (!toast) return null;
        return (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[999] bg-black/80 dark:bg-white/90 text-white dark:text-black text-sm px-5 py-2.5 rounded-xl shadow-lg animate-fade-in pointer-events-none transition-colors duration-300">
                {toast}
            </div>
        );
    }, [toast]);
    return { show, ToastUI };
};

const Library: React.FC = () => {
  const { queue, playSong } = usePlayer();
  const {
    favorites, playlists,
    createPlaylist, importPlaylist, deletePlaylist,
    addToPlaylist, removeFromPlaylist, renamePlaylist,
    exportData, importData
  } = useLibrary();
  const { theme, setTheme, isDark } = useTheme();
  const { show: showToast, ToastUI } = useToast();
  
  const [activeTab, setActiveTab] = useState<Tab>('favorites');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [importId, setImportId] = useState('');
  const [importSource, setImportSource] = useState('netease');
  const [isImporting, setIsImporting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  
  const selectedPlaylist = useMemo(() => 
    playlists.find(p => p.id === selectedPlaylistId) || null
  , [playlists, selectedPlaylistId]);


  const handleCreatePlaylist = () => {
    if (newPlaylistName.trim()) {
      createPlaylist(newPlaylistName);
      setNewPlaylistName('');
      setShowCreateModal(false);
    }
  };

  const handleRenamePlaylist = () => {
      if (selectedPlaylist && renameValue.trim()) {
          renamePlaylist(selectedPlaylist.id, renameValue);
          setShowRenameModal(false);
      }
  };

  const handleImportOnlinePlaylist = async () => {
      // Функция импорта отключена - используйте локальные плейлисты
      showToast('Импорт онлайн-плейлистов недоступен');
      setShowImportModal(false);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const success = importData(event.target.result as string);
          showToast(success ? 'Данные импортированы' : 'Ошибка импорта данных');
        }
      };
      reader.readAsText(file);
    }
  };

  const renderSongList = (songs: Song[], canRemove: boolean = false, playlistId?: string) => (
    <div className="space-y-3 pb-24">
        {songs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">Нет песен</div>
        ) : (
            songs.map((song, idx) => {
                const sName = typeof song.name === 'string' ? song.name : 'Неизвестная песня';
                const sArtist = typeof song.artist === 'string' ? song.artist : 'Неизвестный исполнитель';
                
                return (
                    <div 
                        key={`${song.id}-${idx}`}
                        className="flex items-center space-x-3 bg-white p-2 rounded-xl shadow-sm active:scale-[0.98] transition cursor-pointer"
                        onClick={() => playSong(song)}
                    >
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                            {song.pic ? (
                                <img src={song.pic} alt="art" referrerPolicy={getImgReferrerPolicy(song.pic)} loading="lazy" className="w-full h-full object-cover" />
                            ) : (
                                <MusicIcon className="text-gray-300" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-ios-text text-[15px] font-medium truncate">{sName}</p>
                            <p className="text-ios-subtext text-xs truncate">{sArtist}</p>
                        </div>
                        {canRemove && playlistId && isEditMode && (
                            <button 
                                className="p-2 text-ios-red/70 hover:text-ios-red bg-ios-red/5 rounded-full"
                                onClick={(e) => { e.stopPropagation(); removeFromPlaylist(playlistId, song.id); }}
                            >
                                <TrashIcon size={16} />
                            </button>
                        )}
                    </div>
                );
            })
        )}
    </div>
  );

  return (
    <>
    {ToastUI}
    <div className="p-5 pt-safe min-h-screen bg-ios-bg dark:bg-black transition-colors duration-300">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-ios-text dark:text-white">Моя библиотека</h1>
      </div>

      <div className="flex bg-gray-200/50 dark:bg-gray-800/50 p-1 rounded-xl mb-6 overflow-x-auto no-scrollbar">
        {(['favorites', 'playlists', 'manage', 'about'] as Tab[]).map((t) => (
            <button
                key={t}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap px-2 ${activeTab === t ? 'bg-white dark:bg-gray-700 shadow-sm text-ios-text dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                onClick={() => { setActiveTab(t); setSelectedPlaylistId(null); }}
            >
                {t === 'favorites' ? 'Избранное' : t === 'playlists' ? 'Плейлисты' : t === 'manage' ? 'Управление' : 'О приложении'}
            </button>
        ))}
      </div>

      {activeTab === 'favorites' && (
        <div>
            <div className="flex items-center space-x-2 mb-4 text-ios-red">
                <HeartFillIcon size={20} />
                <span className="font-bold text-lg dark:text-white">Мне нравится ({favorites.length})</span>
            </div>
            {renderSongList(favorites)}
        </div>
      )}

      {activeTab === 'playlists' && !selectedPlaylist && (
        <div className="grid grid-cols-2 gap-4">
            <div onClick={() => setShowCreateModal(true)} className="aspect-square bg-white dark:bg-gray-900 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 active:bg-gray-50 dark:active:bg-gray-800 cursor-pointer">
                <PlusIcon size={32} className="mb-2" />
                <span className="text-sm font-medium">Создать плейлист</span>
            </div>
            <div onClick={() => setShowImportModal(true)} className="aspect-square bg-white dark:bg-gray-900 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-ios-red/30 text-ios-red active:bg-ios-red/5 dark:active:bg-ios-red/10 cursor-pointer">
                <DownloadIcon size={32} className="mb-2" />
                <span className="text-sm font-medium">Импортировать плейлист</span>
            </div>
            {playlists.map(p => (
                <div key={p.id} onClick={() => { setSelectedPlaylistId(p.id); setIsEditMode(false); }} className="aspect-square bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm dark:shadow-none flex flex-col justify-between active:scale-95 transition relative overflow-hidden">
                    <FolderIcon size={28} className="text-ios-red z-10" />
                    <div className="z-10">
                        <p className="font-bold text-ios-text dark:text-white truncate">{String(p.name || 'Безымянный плейлист')}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{p.songs.length} песен</p>
                    </div>
                </div>
            ))}
        </div>
      )}

      {activeTab === 'playlists' && selectedPlaylist && (
          <div>
              <button onClick={() => setSelectedPlaylistId(null)} className="mb-4 text-ios-red text-sm font-medium flex items-center">&larr; Назад к плейлистам</button>
              <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-sm dark:shadow-none mb-4">
                  <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                          <h2 className="text-2xl font-bold truncate dark:text-white">{String(selectedPlaylist.name || 'Безымянный плейлист')}</h2>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{selectedPlaylist.songs.length} песен</p>
                      </div>
                      <button onClick={() => setIsEditMode(!isEditMode)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${isEditMode ? 'bg-ios-red text-white' : 'bg-gray-100 dark:bg-gray-800 text-ios-red'}`}>{isEditMode ? 'Готово' : 'Изменить'}</button>
                  </div>
                  {isEditMode && (
                      <div className="flex items-center space-x-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                          <button onClick={() => {setRenameValue(selectedPlaylist.name); setShowRenameModal(true);}} className="flex-1 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium">Переименовать</button>
                          <button onClick={() => {if(confirm('Удалить плейлист?')){deletePlaylist(selectedPlaylist.id); setSelectedPlaylistId(null);}}} className="flex-1 py-2 bg-ios-red/5 dark:bg-ios-red/10 text-ios-red rounded-lg text-xs font-medium">Удалить</button>
                      </div>
                  )}
              </div>
              {renderSongList(selectedPlaylist.songs, true, selectedPlaylist.id)}
          </div>
      )}

      {activeTab === 'manage' && (
          <div className="space-y-4">
              {/* Тема оформления */}
              <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm dark:shadow-none">
                  <div className="flex items-center space-x-3 mb-4 text-ios-red">
                      {isDark ? <MoonIcon size={20} /> : <SunIcon size={20} />}
                      <h3 className="font-bold text-lg dark:text-white">Тема оформления</h3>
                  </div>
                  <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                      {(['light', 'dark', 'system'] as const).map((t) => (
                          <button
                              key={t}
                              onClick={() => setTheme(t)}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                                  theme === t 
                                      ? 'bg-white dark:bg-gray-700 text-ios-text dark:text-white shadow-sm' 
                                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                              }`}
                          >
                              {t === 'light' ? 'Светлая' : t === 'dark' ? 'Тёмная' : 'Системная'}
                          </button>
                      ))}
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                      {theme === 'system' 
                          ? 'Автоматически переключается в зависимости от системных настроек' 
                          : isDark 
                              ? 'Тёмная тема активна' 
                              : 'Светлая тема активна'}
                  </p>
              </div>


              <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm dark:shadow-none">
                  <div className="flex items-center space-x-3 mb-4 text-gray-600 dark:text-gray-400">
                      <UploadIcon size={20} />
                      <h3 className="font-bold text-lg dark:text-white">Резервное копирование</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                      <button onClick={exportData} className="py-3 bg-gray-100 dark:bg-gray-800 text-ios-text dark:text-white rounded-xl font-medium text-xs">Экспорт JSON</button>
                      <div className="relative">
                          <button className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-ios-text dark:text-white rounded-xl font-medium text-xs">Импорт данных</button>
                          <input type="file" accept=".json" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileImport} />
                      </div>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'about' && (
          <div className="space-y-4 pb-24">
              {/* 应用信息 */}
              <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm dark:shadow-none text-center">
                  <div className="w-16 h-16 bg-ios-red/10 dark:bg-ios-red/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <MusicIcon size={32} className="text-ios-red" />
                  </div>
                  <h2 className="text-2xl font-bold text-ios-text dark:text-white">TuneFree RU</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Современный PWA музыкальный плеер</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">v1.1.0</p>
              </div>

              {/* 功能特性 */}
              <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm dark:shadow-none">
                  <div className="flex items-center space-x-3 mb-4 text-ios-red">
                      <InfoIcon size={20} />
                      <h3 className="font-bold text-lg dark:text-white">Возможности</h3>
                  </div>
                  <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-start gap-3">
                          <span className="text-ios-red font-bold mt-0.5">1</span>
                          <div>
                              <p className="font-medium text-ios-text dark:text-white">Поиск музыки</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">YouTube через Piped API</p>
                          </div>
                      </div>
                      <div className="flex items-start gap-3">
                          <span className="text-ios-red font-bold mt-0.5">2</span>
                          <div>
                              <p className="font-medium text-ios-text dark:text-white">Воспроизведение аудио</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">AAC формат через Piped</p>
                          </div>
                      </div>
                      <div className="flex items-start gap-3">
                          <span className="text-ios-red font-bold mt-0.5">3</span>
                          <div>
                              <p className="font-medium text-ios-text dark:text-white">Визуализация аудио</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">Canvas спектр с пиковыми индикаторами</p>
                          </div>
                      </div>
                      <div className="flex items-start gap-3">
                          <span className="text-ios-red font-bold mt-0.5">5</span>
                          <div>
                              <p className="font-medium text-ios-text dark:text-white">PWA офлайн</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">Добавьте на главный экран как приложение</p>
                          </div>
                      </div>
                  </div>
              </div>

              {/* 技术栈 */}
              <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm dark:shadow-none">
                  <h3 className="font-bold text-lg mb-3 text-ios-text dark:text-white">Технологии</h3>
                  <div className="flex flex-wrap gap-2">
                      {['React 19', 'TypeScript', 'Tailwind CSS', 'Vite', 'Framer Motion', 'Web Audio API', 'Canvas'].map(tech => (
                          <span key={tech} className="text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-full">{tech}</span>
                      ))}
                  </div>
              </div>

              {/* Backend API */}
              <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm dark:shadow-none">
                  <h3 className="font-bold text-lg mb-3 text-ios-text dark:text-white">Backend API</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      Музыкальные данные предоставлены <span className="font-medium text-ios-text dark:text-white">Piped API</span> (YouTube).
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
                      Приватные инстансы Piped для стабильной работы
                  </p>
              </div>

              {/* Ссылки */}
              <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm dark:shadow-none">
                  <h3 className="font-bold text-lg mb-3 text-ios-text dark:text-white">Ссылки</h3>
                  <div className="space-y-3">
                      <a
                          href="https://xilan.ccwu.cc/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl active:bg-gray-100 dark:active:bg-gray-700 transition"
                      >
                          <div className="flex items-center gap-3">
                              <ExternalLinkIcon size={18} className="text-ios-red" />
                              <span className="text-sm font-medium text-ios-text dark:text-white">Онлайн демо</span>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500">xilan.ccwu.cc</span>
                      </a>
                      <a
                          href="https://github.com/alanbulan/musicxilan"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl active:bg-gray-100 dark:active:bg-gray-700 transition"
                      >
                          <div className="flex items-center gap-3">
                              <GithubIcon size={18} className="text-gray-700 dark:text-gray-400" />
                              <span className="text-sm font-medium text-ios-text dark:text-white">GitHub репозиторий</span>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500">alanbulan/musicxilan</span>
                      </a>
                  </div>
              </div>

              {/* Disclaimer */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl">
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed text-center">
                      Проект для изучения React и современного фронтенда. Музыкальные данные от YouTube через Piped API. Поддерживайте легальную музыку.
                  </p>
                  <p className="text-[11px] text-gray-300 dark:text-gray-600 mt-2 text-center">MIT License &copy; 2026 TuneFree RU</p>
              </div>
          </div>
      )}
    </div>

    {/* ====== Модал создания плейлиста ====== */}
    {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" onClick={() => setShowCreateModal(false)}>
            <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-2xl p-6 pb-safe animate-fade-in transition-colors duration-300" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-4 dark:text-white">Новый плейлист</h3>
                <input
                    type="text"
                    placeholder="Название плейлиста"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ios-red/20 mb-4 dark:text-white"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                />
                <div className="flex space-x-3">
                    <button onClick={() => setShowCreateModal(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-medium text-sm">Отмена</button>
                    <button onClick={handleCreatePlaylist} className="flex-1 py-3 bg-ios-red text-white rounded-xl font-bold text-sm">Создать</button>
                </div>
            </div>
        </div>
    )}

    {/* ====== Модал импорта плейлиста ====== */}
    {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" onClick={() => !isImporting && setShowImportModal(false)}>
            <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-2xl p-6 pb-safe animate-fade-in transition-colors duration-300" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-4 dark:text-white">Импорт плейлиста</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Импорт онлайн-плейлистов временно недоступен. Используйте локальные плейлисты.
                </p>
                <div className="flex space-x-3">
                    <button onClick={() => setShowImportModal(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-medium text-sm">Закрыть</button>
                </div>
            </div>
        </div>
    )}

    {/* ====== Модал переименования ====== */}
    {showRenameModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" onClick={() => setShowRenameModal(false)}>
            <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-2xl p-6 pb-safe animate-fade-in transition-colors duration-300" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-4 dark:text-white">Переименовать</h3>
                <input
                    type="text"
                    placeholder="Новое название"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ios-red/20 mb-4 dark:text-white"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleRenamePlaylist()}
                />
                <div className="flex space-x-3">
                    <button onClick={() => setShowRenameModal(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-medium text-sm">Отмена</button>
                    <button onClick={handleRenamePlaylist} className="flex-1 py-3 bg-ios-red text-white rounded-xl font-bold text-sm">Сохранить</button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};

export default Library;
