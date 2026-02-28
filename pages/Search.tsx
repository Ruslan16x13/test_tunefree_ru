import React, { useState, useEffect, memo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getImgReferrerPolicy, searchSongs, searchAggregate } from '../services/api';
import { Song } from '../types';
import { usePlayer } from '../contexts/PlayerContext';
import { SearchIcon, MusicIcon, TrashIcon } from '../components/Icons';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ====== Мемоизированная карточка результата поиска ======
const SearchResultItem = memo<{
    song: Song;
    isCurrent: boolean;
    isPlaying: boolean;
    onPlay: (song: Song) => void;
}>(({ song, isCurrent, isPlaying, onPlay }) => {
    const songName = typeof song.name === 'string' ? song.name : 'Неизвестная песня';
    const songArtist = typeof song.artist === 'string' ? song.artist : 'Неизвестный исполнитель';

    return (
        <div
            className={`flex items-center space-x-3 p-3 rounded-xl transition cursor-pointer ${isCurrent ? 'bg-white dark:bg-gray-800 shadow-sm ring-1 ring-ios-red/20' : 'hover:bg-white/50 dark:hover:bg-gray-800/50 active:bg-white dark:active:bg-gray-800'}`}
            onClick={() => onPlay(song)}
        >
            <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                {song.pic ? (
                    <img src={song.pic} alt={songName} referrerPolicy={getImgReferrerPolicy(song.pic)} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                    <MusicIcon className="text-gray-300 dark:text-gray-600" size={24} />
                )}
                {isCurrent && isPlaying && (
                     <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                         <div className="w-3 h-3 rounded-full bg-ios-red animate-pulse" />
                     </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className={`font-medium truncate text-[15px] ${isCurrent ? 'text-ios-red' : 'text-ios-text dark:text-white'}`}>
                    {songName}
                </p>
                <div className="flex items-center mt-0.5 space-x-2">
                    <p className="text-xs text-ios-subtext dark:text-gray-400 truncate">{songArtist}</p>
                </div>
            </div>
        </div>
    );
});

// ====== Скелетон поиска ======
const SearchSkeleton = () => (
    <div className="space-y-2">
        {[0,1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center space-x-3 p-3 rounded-xl animate-pulse">
                <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
                </div>
            </div>
        ))}
    </div>
);

const Search: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Song[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'aggregate' | 'single'>('aggregate');
  const [searchSource, setSearchSource] = useState<'youtube' | 'piped'>('youtube');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [history, setHistory] = useState<string[]>(() => {
      try {
          const stored = localStorage.getItem('tunefree_search_history');
          return stored ? JSON.parse(stored) : [];
      } catch {
          return [];
      }
  });

  useEffect(() => {
      const q = searchParams.get('q');
      if (q !== null && q !== query) {
          setQuery(q);
      }
  }, [searchParams]);

  const debouncedQuery = useDebounce(query, 800);
  const { playSong, currentSong, isPlaying } = usePlayer();

  useEffect(() => {
      localStorage.setItem('tunefree_search_history', JSON.stringify(history));
  }, [history]);

  const addToHistory = useCallback((term: string) => {
      if (!term || typeof term !== 'string' || !term.trim()) return;
      setHistory(prev => {
          const newHist = [term, ...prev.filter(h => h !== term)].slice(0, 15);
          return newHist;
      });
  }, []);

  const clearHistory = useCallback(() => {
      if (confirm('Очистить историю поиска?')) {
          setHistory([]);
      }
  }, []);

  useEffect(() => {
      setResults([]);
      setPage(1);
      setHasMore(true);
  }, [debouncedQuery]);

  useEffect(() => {
    if (debouncedQuery) {
      setIsSearching(true);

      const fetchSearch = async () => {
          try {
              // Используем выбранный источник или агрегированный поиск
              let data;
              if (searchMode === 'aggregate') {
                  data = await searchAggregate(debouncedQuery, page);
              } else {
                  data = await searchSongs(debouncedQuery, searchSource, page);
              }

              if (!data || data.length === 0) {
                  setHasMore(false);
              } else {
                  setResults(prev => page === 1 ? data : [...prev, ...data]);
              }
          } catch (e) {
              console.error(e);
              if (page === 1) setResults([]);
          } finally {
              setIsSearching(false);
          }
      };

      fetchSearch();
    }
  }, [debouncedQuery, page, searchSource, searchMode]);

  const handleLoadMore = useCallback(() => {
      if (!isSearching && hasMore) {
          setPage(prev => prev + 1);
      }
  }, [isSearching, hasMore]);

  const handlePlaySong = useCallback((song: Song) => {
      addToHistory(query);
      playSong(song);
  }, [query, playSong, addToHistory]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          addToHistory(query);
          setSearchParams({ q: query });
          (e.target as HTMLInputElement).blur();
      }
  }, [query, addToHistory, setSearchParams]);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
  }, []);

  return (
    <div className="min-h-full p-5 pt-safe bg-ios-bg dark:bg-black transition-colors duration-300">
      <div className="sticky top-0 bg-ios-bg/95 dark:bg-black/95 backdrop-blur-md z-20 pb-2 transition-all">
        <h1 className="text-3xl font-bold mb-4 text-ios-text dark:text-white">Поиск</h1>

        <div className="relative shadow-sm rounded-xl mb-3">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Поиск музыки..."
            className="w-full bg-white dark:bg-gray-900 text-ios-text dark:text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-ios-red/20 transition-all placeholder-gray-400 dark:placeholder-gray-500 text-[15px]"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Переключатель источников */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => {
              setSearchMode('aggregate');
              setPage(1);
              setResults([]);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              searchMode === 'aggregate'
                ? 'bg-ios-red text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 active:opacity-70'
            }`}
          >
            Все сразу
          </button>
          <button
            onClick={() => {
              setSearchMode('single');
              setSearchSource('youtube');
              setPage(1);
              setResults([]);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              searchMode === 'single' && searchSource === 'youtube'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 active:opacity-70'
            }`}
          >
            YouTube
          </button>
          <button
            onClick={() => {
              setSearchMode('single');
              setSearchSource('piped');
              setPage(1);
              setResults([]);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              searchMode === 'single' && searchSource === 'piped'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 active:opacity-70'
            }`}
          >
            Piped
          </button>
        </div>

      </div>

      <div className="space-y-2 mt-4 pb-20">
        {!query && history.length > 0 && (
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">История поиска</h3>
                    <button onClick={clearHistory} className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1">
                        <TrashIcon size={16} />
                    </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {history.map((term, idx) => (
                        <button
                            key={idx}
                            onClick={() => {
                                setQuery(String(term));
                                setSearchParams({ q: String(term) });
                            }}
                            className="px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-xs rounded-lg border border-gray-100 dark:border-gray-800 active:bg-gray-100 dark:active:bg-gray-800 transition truncate max-w-[150px]"
                        >
                            {String(term)}
                        </button>
                    ))}
                </div>
            </div>
        )}

        {results.length > 0 && results.map((song, idx) => (
            <SearchResultItem
                key={`${song.source}-${song.id}-${idx}`}
                song={song}
                isCurrent={currentSong?.id === song.id}
                isPlaying={isPlaying}
                onPlay={handlePlaySong}
            />
        ))}

        {isSearching && results.length === 0 && (
           <SearchSkeleton />
        )}

        {isSearching && results.length > 0 && (
           <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-ios-red border-t-transparent rounded-full animate-spin"></div>
           </div>
        )}

        {!isSearching && results.length > 0 && hasMore && (
            <button
                onClick={handleLoadMore}
                className="w-full py-4 text-sm text-ios-subtext dark:text-gray-400 font-medium active:bg-gray-100 dark:active:bg-gray-800 rounded-xl transition"
            >
                Показать ещё
            </button>
        )}

        {!isSearching && results.length === 0 && query !== '' && (
             <div className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">
                <MusicIcon size={48} className="mx-auto mb-4 opacity-10" />
                <p>Ничего не найдено, попробуйте упростить запрос</p>
             </div>
        )}
      </div>
    </div>
  );
};

export default Search;
