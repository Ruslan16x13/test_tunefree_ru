
import React, { useRef, useEffect } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { useTheme } from '../contexts/ThemeContext';

interface AudioVisualizerProps {
  isPlaying: boolean;
}

// === Конфигурация визуализации ===
const BAR_COUNT = 48;
const SMOOTHING_ALPHA = 0.35;           // Коэффициент сглаживания (чем ниже, тем чувствительнее)
const RESPONSE_CURVE = 0.7;             // Экспонента нелинейной кривой отклика
const MIN_BAR_PERCENT = 0.04;           // Минимальный видимый процент высоты
const DECAY_SPEED = 0.92;               // Коэффициент затухания при паузе (чем ближе к 1, тем медленнее)

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying }) => {
  const { analyser } = usePlayer();
  const { isDark } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Персистентное состояние, сохраняется между кадрами
  const stateRef = useRef({
      simValues: new Array(BAR_COUNT).fill(0),
      simTargets: new Array(BAR_COUNT).fill(0),
      phase: 0,
      // Текущие отображаемые значения (для плавного перехода, включая затухание при паузе)
      displayValues: new Array(BAR_COUNT).fill(0),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Адаптация к высокому DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
    let animationId: number = 0;

    // === Рендеринг одного столбца (минималистичный стиль, без пиковых индикаторов) ===
    const renderBar = (
        ctx: CanvasRenderingContext2D,
        x: number,
        percent: number,
        h: number,
        w: number,
    ) => {
        if (percent < MIN_BAR_PERCENT) percent = MIN_BAR_PERCENT;

        const barHeight = percent * h;
        const radius = w / 2;
        const y = h - barHeight;

        // Минималистичный стиль — чем выше интенсивность, тем непрозрачнее
        const alpha = 0.12 + percent * 0.38;
        ctx.fillStyle = isDark ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;

        // Рисование столбца с закруглёнными углами
        ctx.beginPath();
        if ('roundRect' in (ctx as any)) {
            // @ts-ignore
            ctx.roundRect(x, y, w, barHeight, radius);
        } else {
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, h - radius);
            ctx.quadraticCurveTo(x + w, h, x + w - radius, h);
            ctx.lineTo(x + radius, h);
            ctx.quadraticCurveTo(x, h, x, h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
        }
        ctx.fill();
    };

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      const totalSpace = width / BAR_COUNT;
      const barWidth = totalSpace * 0.55;
      let x = (totalSpace - barWidth) / 2;

      const state = stateRef.current;

      // Защитная проверка: HMR горячая перезагрузка может привести к несоответствию структуры stateRef
      if (!state.displayValues || state.displayValues.length !== BAR_COUNT) {
          state.displayValues = new Array(BAR_COUNT).fill(0);
      }
      if (!state.simValues || state.simValues.length !== BAR_COUNT) {
          state.simValues = new Array(BAR_COUNT).fill(0);
      }
      if (!state.simTargets || state.simTargets.length !== BAR_COUNT) {
          state.simTargets = new Array(BAR_COUNT).fill(0);
      }

      if (isPlaying && analyser) {
          // --- Реальный режим (с AudioContext) ---
          analyser.getByteFrequencyData(dataArray);
          const binCount = dataArray.length;

          // Логарифмическое отображение частот: больше столбцов для низких частот, сжатие высоких
          // Чтобы вся область визуализации реагировала, а не только левая часть
          const logMax = Math.log(binCount);
          for (let i = 0; i < BAR_COUNT; i++) {
            const startBin = Math.max(1, Math.round(Math.exp(logMax * i / BAR_COUNT)));
            const endBin = Math.max(startBin + 1, Math.round(Math.exp(logMax * (i + 1) / BAR_COUNT)));

            let sum = 0;
            let count = 0;
            for (let b = startBin; b < endBin && b < binCount; b++) {
                sum += dataArray[b];
                count++;
            }
            const rawValue = count > 0 ? sum / count : 0;
            // Нелинейный отклик
            let percent = Math.max(0, Math.min(1, rawValue / 255));
            percent = Math.pow(percent, RESPONSE_CURVE);

            // Сглаживание: быстрый подъём, медленное падение
            if (percent > state.displayValues[i]) {
                state.displayValues[i] += (percent - state.displayValues[i]) * (1 - SMOOTHING_ALPHA);
            } else {
                state.displayValues[i] += (percent - state.displayValues[i]) * 0.15;
            }

            renderBar(ctx, x, state.displayValues[i], height, barWidth);
            x += totalSpace;
          }

      } else if (isPlaying && !analyser) {
          // --- Симуляционный режим (без AudioContext, при воспроизведении) ---
          state.phase += 0.03;

          if (Math.random() < 0.05) {
              const kickStrength = 180 + Math.random() * 75;
              for (let i = 0; i < 12; i++) {
                   const decay = 1 - (i / 12);
                   state.simTargets[i] = Math.max(state.simTargets[i], kickStrength * decay);
              }
          }

          for (let i = 0; i < BAR_COUNT; i++) {
              const baseProfile = Math.max(0, 80 - i);
              const noise = (Math.sin(i * 0.3 + state.phase) + Math.sin(i * 0.7 - state.phase)) * 20;
              let target = baseProfile + Math.abs(noise);
              if (i > 15 && Math.random() < 0.05) {
                  target += Math.random() * 100 * (i / BAR_COUNT);
              }
              state.simTargets[i] = Math.max(state.simTargets[i], target);
          }

          for (let i = 0; i < BAR_COUNT; i++) {
             state.simTargets[i] -= 3;
             if (state.simTargets[i] < 0) state.simTargets[i] = 0;
             const diff = state.simTargets[i] - state.simValues[i];
             state.simValues[i] += diff * 0.3;

             let percent = Math.max(0, Math.min(1, state.simValues[i] / 255));
             percent = Math.pow(percent, RESPONSE_CURVE);
             state.displayValues[i] = percent;

             renderBar(ctx, x, percent, height, barWidth);
             x += totalSpace;
          }

      } else {
          // --- Состояние паузы: плавное затухание столбцов до минимальной высоты ---
          let allSettled = true;
          for (let i = 0; i < BAR_COUNT; i++) {
              state.displayValues[i] *= DECAY_SPEED;
              if (state.displayValues[i] > MIN_BAR_PERCENT + 0.005) {
                  allSettled = false;
              }
              renderBar(ctx, x, state.displayValues[i], height, barWidth);
              x += totalSpace;
          }

          // Полное затухание — остановка анимации для снижения нагрузки на CPU
          if (allSettled) {
              // Последний кадр: рисуем статичные минимальные столбцы
              ctx.clearRect(0, 0, width, height);
              x = (totalSpace - barWidth) / 2;
              for (let i = 0; i < BAR_COUNT; i++) {
                  state.displayValues[i] = 0;
                  renderBar(ctx, x, MIN_BAR_PERCENT, height, barWidth);
                  x += totalSpace;
              }
              return; // Остановка цикла rAF
          }
      }
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [analyser, isPlaying, isDark]);

  return (
    <canvas
        ref={canvasRef}
        className="w-full h-full block"
    />
  );
};

export default AudioVisualizer;
