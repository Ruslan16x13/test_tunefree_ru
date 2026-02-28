import React, { useState, useEffect } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { getImgReferrerPolicy } from '../services/api';
import { PlayIcon, PauseIcon, NextIcon, MusicIcon } from './Icons';
import { motion } from 'framer-motion';

interface MiniPlayerProps {
  onExpand: () => void;
  layoutId?: string;
}

const MiniPlayer: React.FC<MiniPlayerProps> = ({ onExpand, layoutId }) => {
  const { currentSong, isPlaying, togglePlay, playNext, queue } = usePlayer();
  const [imgError, setImgError] = useState(false);

  // Reset error state when song changes
  useEffect(() => {
    setImgError(false);
  }, [currentSong?.id, currentSong?.pic]);

  const hasSong = !!currentSong;
  
  return (
    <motion.div 
      layoutId={layoutId}
      className="fixed bottom-[88px] left-3 right-3 h-14 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl flex items-center px-4 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] z-40 border border-gray-100 dark:border-gray-800 cursor-pointer overflow-hidden transition-colors duration-300"
      onClick={onExpand}
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
    >
      <motion.div 
        className="flex items-center w-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
          <div className={`relative w-10 h-10 rounded-full overflow-hidden mr-3 flex-shrink-0 shadow-sm flex items-center justify-center ${hasSong ? 'bg-gray-200 dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800'}`}>
            {hasSong && currentSong?.pic && !imgError ? (
                <img
                    src={currentSong.pic}
                    alt="Art"
                    referrerPolicy={getImgReferrerPolicy(currentSong.pic)}
                    loading="lazy"
                    className="w-full h-full object-cover animate-spin-slow"
                    style={{ 
                        animationPlayState: isPlaying ? 'running' : 'paused'
                    }}
                    onError={() => setImgError(true)}
                />
            ) : (
                <MusicIcon className="text-gray-400 dark:text-gray-500 w-6 h-6" />
            )}
          </div>
          
          <div className="flex-1 min-w-0 pr-2">
            <p className="text-ios-text dark:text-white text-sm font-semibold truncate">
                {hasSong ? currentSong?.name : "TuneFree"}
            </p>
            <p className="text-ios-subtext dark:text-gray-400 text-xs truncate">
              {hasSong ? currentSong?.artist : "Слушайте мир"}
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <button 
              onClick={(e) => { 
                  e.stopPropagation(); 
                  if (hasSong) togglePlay(); 
              }}
              disabled={!hasSong}
              className={`text-ios-text dark:text-white hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none transition-transform active:scale-90 ${!hasSong ? 'opacity-50' : ''}`}
            >
              {isPlaying ? <PauseIcon size={24} className="fill-current" /> : <PlayIcon size={24} className="fill-current" />}
            </button>
            <button 
              onClick={(e) => { 
                  e.stopPropagation(); 
                  if (queue.length > 0) playNext(); 
              }}
              disabled={queue.length === 0}
              className={`text-ios-text dark:text-white hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none transition-transform active:scale-90 ${queue.length === 0 ? 'opacity-50' : ''}`}
            >
              <NextIcon size={24} className="fill-current" />
            </button>
          </div>
      </motion.div>
    </motion.div>
  );
};

export default MiniPlayer;
