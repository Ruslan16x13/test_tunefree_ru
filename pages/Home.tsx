import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { getImgReferrerPolicy, getTopListDetail } from '../services/api';
import { Song, TopList } from '../types';
import { usePlayer } from '../contexts/PlayerContext';
import { PlayIcon, MusicIcon, ErrorIcon } from '../components/Icons';

// ====== Кэш данных — предотвращает повторные запросы при смене источника ======
const _topListCache = new Map<string, { lists: TopList[]; ts: number }>();
const _detailCache = new Map<string, { songs: Song[]; ts: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 минуты

// ====== Мемоизированная карточка песни — предотвращает повторный рендеринг при скролле ======
const SongCard = memo<{ song: Song; idx: number; onPlay: (s: Song) => void }>(({ song, idx, onPlay }) => {
    const songName = typeof song.name === 'string' ? song.name : 'Неизвестная песня';
    const songArtist = typeof song.artist === 'string' ? song.artist : 'Неизвестный исполнитель';

    return (
        <div
            className="flex items-center space-x-4 bg-white dark:bg-gray-900 p-3 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] dark:shadow-none active:scale-[0.99] transition cursor-pointer"
            onClick={() => onPlay(song)}
        >
            <span className={`font-bold text-lg w-6 text-center italic ${idx < 3 ? 'text-ios-red' : 'text-ios-subtext/50 dark:text-gray-500/50'}`}>{idx + 1}</span>
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                {song.pic ? (
                    <img src={song.pic} alt={songName} referrerPolicy={getImgReferrerPolicy(song.pic)} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                        <MusicIcon size={20} />
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-ios-text dark:text-white truncate text-[15px]">{songName}</p>
                <div className="flex items-center mt-1">
                    <p className="text-xs text-ios-subtext dark:text-gray-400 truncate">{songArtist}</p>
                </div>
            </div>
            <button className="p-3 text-ios-red/80 hover:text-ios-red bg-gray-50 dark:bg-gray-800 rounded-full">
                <PlayIcon size={18} className="fill-current ml-0.5" />
            </button>
        </div>
    );
});

// ====== Компонент скелетона ======
const SongSkeleton = () => (
    <div className="flex items-center space-x-4 bg-white dark:bg-gray-900 p-3 rounded-2xl animate-pulse">
        <div className="w-6 h-5 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
        <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
        </div>
    </div>
);

const TopListSkeleton = () => (
    <div className="flex gap-3 overflow-hidden pb-2">
        {[0,1,2,3].map(i => (
            <div key={i} className="flex-shrink-0 bg-white dark:bg-gray-900 p-2 rounded-2xl min-w-[120px] max-w-[140px] animate-pulse">
                <div className="w-full aspect-square mb-2 rounded-xl bg-gray-200 dark:bg-gray-700" />
                <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded mx-1 mb-1" />
                <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded mx-1 w-2/3" />
            </div>
        ))}
    </div>
);

const Home: React.FC = () => {
  const [topLists, setTopLists] = useState<TopList[]>([]);
  const [featuredSongs, setFeaturedSongs] = useState<Song[]>([]);
  const [listsLoading, setListsLoading] = useState(true);   // Только загрузка списков чартов
  const [songsLoading, setSongsLoading] = useState(true);    // Только загрузка списка песен
  const [error, setError] = useState(false);
  const [trendSource, setTrendSource] = useState<'youtube' | 'piped'>('youtube');
  const { playSong } = usePlayer();
  // Предотвращение race condition
  const fetchIdRef = useRef(0);

  const fetchTrending = useCallback(async () => {
    const thisId = ++fetchIdRef.current;
    setError(false);
    setListsLoading(false); // У нас нет списка чартов, сразу показываем песни
    setSongsLoading(true);

    try {
        // Получаем тренды через API с выбранного источника
        const songs = await getTopListDetail('trending', trendSource);
        if (thisId !== fetchIdRef.current) return;
        
        if (songs && songs.length > 0) {
            const sliced = songs.slice(0, 20);
            setFeaturedSongs(sliced);
            _detailCache.set(`trending-${trendSource}`, { songs: sliced, ts: Date.now() });
        } else {
            setFeaturedSongs([]);
            setError(true);
        }
    } catch (e) {
        if (thisId === fetchIdRef.current) {
            setFeaturedSongs([]);
            setError(true);
        }
    } finally {
        if (thisId === fetchIdRef.current) {
            setSongsLoading(false);
        }
    }
  }, []);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending, trendSource]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return "Доброй ночи";
    if (hour < 11) return "Доброе утро";
    if (hour < 13) return "Добрый день";
    if (hour < 18) return "Добрый день";
    return "Добрый вечер";
  };

  const handleRefresh = useCallback(async () => {
      setSongsLoading(true);
      try {
        const songs = await getTopListDetail('trending', trendSource);
        const sliced = songs.slice(0, 20);
        setFeaturedSongs(sliced);
        _detailCache.set(`trending-${trendSource}`, { songs: sliced, ts: Date.now() });
      } catch (e) {
        console.error("Failed to load trending", e);
      } finally {
        setSongsLoading(false);
      }
  }, []);

  // 稳定引用的 playSong 回调
  const handlePlay = useCallback((song: Song) => {
    playSong(song);
  }, [playSong]);

  return (
    <div className="p-5 pt-safe min-h-screen bg-ios-bg dark:bg-black transition-colors duration-300">
      <div className="flex items-end justify-between mb-6 mt-2">
        <h1 className="text-3xl font-bold text-ios-text dark:text-white tracking-tight">{getGreeting()}</h1>
      </div>

      {/* Переключатель источников */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTrendSource('youtube')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            trendSource === 'youtube'
              ? 'bg-red-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 active:opacity-70'
          }`}
        >
          YouTube Тренды
        </button>
        <button
          onClick={() => setTrendSource('piped')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            trendSource === 'piped'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 active:opacity-70'
          }`}
        >
          Piped Тренды
        </button>
      </div>

      {error && (
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <ErrorIcon size={20} />
              <span className="text-xs font-medium">Источник недоступен, попробуйте позже</span>
          </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-ios-text dark:text-white tracking-tight">Популярное</h2>
            <button 
                onClick={handleRefresh}
                className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full active:bg-gray-200 dark:active:bg-gray-700 transition"
            >
                Обновить
            </button>
        </div>

        {songsLoading && featuredSongs.length === 0 ? (
             <div className="space-y-3 pb-24">
                {[0,1,2,3,4].map(i => <SongSkeleton key={i} />)}
             </div>
        ) : featuredSongs.length > 0 ? (
            <div className="space-y-3 pb-24">
            {featuredSongs.map((song, idx) => (
                <SongCard key={`${song.id}-${idx}`} song={song} idx={idx} onPlay={handlePlay} />
            ))}
            </div>
        ) : (
            !songsLoading && (
                <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm bg-white/50 dark:bg-gray-900/50 rounded-xl">
                    <p>Нет данных о песнях</p>
                    <p className="text-xs mt-1">Попробуйте выбрать другой чарт или источник</p>
                </div>
            )
        )}
      </section>
    </div>
  );
};

export default Home;

