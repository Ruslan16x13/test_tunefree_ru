import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { DownloadIcon, MusicIcon } from './Icons';
import { getImgReferrerPolicy } from '../services/api';
import * as youtube from '../services/youtube';

interface DownloadPopupProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song | null;
}

// Для YouTube/Piped используем доступные аудио форматы
const QUALITY_MAP: Record<string, { label: string, desc: string, ext: string }> = {
  'audio': { label: 'Аудио', desc: 'M4A / AAC', ext: 'm4a' },
};

const DownloadPopup: React.FC<DownloadPopupProps> = ({ isOpen, onClose, song }) => {
  const [downloadingType, setDownloadingType] = useState<string | null>(null);

  // Блокировка скролла фона при открытии модала
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  if (!isOpen || !song) return null;

  // Для YouTube используем только один аудио поток
  const availableTypes = ['audio'];

  // Асинхронное получение URL для скачивания
  const handleDownload = async (type: string) => {
    if (downloadingType) return;
    setDownloadingType(type);
    try {
      // Получаем аудио URL через YouTube API
      const url = await youtube.getAudioUrl(String(song.id));
      if (!url) {
          alert('Не удалось получить ссылку для скачивания');
          return;
      }
      const meta = QUALITY_MAP[type] || { ext: 'm4a' };
      const filename = `${song.artist} - ${song.name}.${meta.ext}`;
      
      // Скачивание через временную ссылку
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      onClose();
    } finally {
      setDownloadingType(null);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[70] backdrop-blur-sm transition-opacity touch-auto"
        onClick={onClose}
        onPointerDown={e => e.stopPropagation()}
      />

      <div
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl z-[71] p-6 pb-safe shadow-2xl animate-slide-up touch-auto transition-colors duration-300"
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                {song.pic ? (
                    <img src={song.pic} referrerPolicy={getImgReferrerPolicy(song.pic)} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                        <MusicIcon size={24} />
                    </div>
                )}
            </div>
            <div>
                <h3 className="font-bold text-lg truncate pr-4 dark:text-white">{song.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Выберите качество</p>
            </div>
        </div>

        <div className="space-y-3">
            {availableTypes.map((type) => {
                const info = QUALITY_MAP[type] || { label: type.toUpperCase(), desc: 'Неизвестный формат', ext: 'mp3' };
                return (
                    <button
                        key={type}
                        onClick={() => handleDownload(type)}
                        disabled={!!downloadingType}
                        className={`w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl transition ${downloadingType ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600'}`}
                    >
                        <div className="flex flex-col items-start">
                            <span className="font-bold text-gray-800 dark:text-gray-200">{info.label}</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">{info.desc}</span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-gray-400 shadow-sm">
                            {downloadingType === type ? (
                                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-ios-red rounded-full animate-spin" />
                            ) : (
                                <DownloadIcon size={16} />
                            )}
                        </div>
                    </button>
                )
            })}
        </div>

        <button 
            onClick={onClose}
            className="w-full mt-6 py-4 text-center font-bold text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl active:bg-gray-50 dark:active:bg-gray-700 transition-colors duration-300"
        >
            Отмена
        </button>
      </div>
    </>
  );
};

export default DownloadPopup;
