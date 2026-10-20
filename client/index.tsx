import { createClient } from "eraspace/client";
import { useEffect, useRef, useState } from "preact/hooks";
import type app from "../server/index";

const client = createClient<typeof app>({ reloadOnDeploy: true });

const BOARD_W = 480;
const BOARD_H = 640;

type Mode = "menu" | "playing" | "over";
type Bullet = { x: number; y: number };
type Enemy = { x: number; y: number; speed: number; hue: number };

export default function App() {
  const [mode, setMode] = useState<Mode>("menu");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const board = client.useQuery("leaderboard");
  const submit = client.useMutation("submit");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (mode !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    let fx = BOARD_W / 2;
    let cooldown = 0;
    let elapsed = 0;
    let spawnIn = 0.6;
    let points = 0;
    let livesLeft = 3;
    let dead = false;
    let shownScore = 0;
    let shownLives = 3;
    let bullets: Bullet[] = [];
    let enemies: Enemy[] = [];
    const stars = Array.from({ length: 70 }, () => ({
      x: Math.random() * BOARD_W,
      y: Math.random() * BOARD_H,
      s: 0.4 + Math.random() * 1.6,
    }));
    const keys = new Set<string>();
    const pointer = { active: false, x: fx };

    const draw = () => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, BOARD_W, BOARD_H);
      g.fillStyle = "#fff";
      for (const st of stars) {
        const yy = (st.y + elapsed * 30 * st.s) % BOARD_H;
        g.globalAlpha = 0.2 + st.s * 0.3;
        g.fillRect(st.x, yy, st.s, st.s * 2);
      }
      g.globalAlpha = 1;
      for (const en of enemies) {
        g.fillStyle = `hsl(${en.hue} 70% 60%)`;
        g.fillRect(en.x - 11, en.y - 11, 22, 22);
        g.fillStyle = "#000";
        g.fillRect(en.x - 5, en.y - 4, 4, 4);
        g.fillRect(en.x + 1, en.y - 4, 4, 4);
      }
      g.fillStyle = "#ffd24d";
      for (const b of bullets) g.fillRect(b.x - 1.5, b.y - 7, 3, 14);
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(fx, BOARD_H - 40);
      g.lineTo(fx + 15, BOARD_H - 14);
      g.lineTo(fx - 15, BOARD_H - 14);
      g.closePath();
      g.fill();
    };

    const syncLives = () => {
      if (livesLeft !== shownLives) {
        shownLives = livesLeft;
        setLives(livesLeft);
      }
    };

    let raf = 0;
    let watchdog = 0;
    let lastTick = performance.now();
    let lastTickStamp = performance.now();
    const step = (now: number) => {
      if (dead) return;
      const dt = Math.min(0.25, (now - lastTickStamp) / 1000);
      lastTickStamp = now;
      elapsed += dt;
      const level = Math.floor(elapsed / 15) + 1;

      if (keys.has("arrowleft") || keys.has("a")) fx -= 280 * dt;
      if (keys.has("arrowright") || keys.has("d")) fx += 280 * dt;
      if (pointer.active) fx += (pointer.x - fx) * Math.min(1, dt * 9);
      fx = Math.max(20, Math.min(BOARD_W - 20, fx));

      cooldown -= dt;
      if ((keys.has(" ") || pointer.active) && cooldown <= 0) {
        bullets.push({ x: fx, y: BOARD_H - 52 });
        cooldown = 0.22;
      }

      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawnIn = Math.max(0.3, 1.15 - level * 0.09);
        enemies.push({
          x: 26 + Math.random() * (BOARD_W - 52),
          y: -24,
          speed: 44 + level * 13 + Math.random() * 26,
          hue: Math.floor(Math.random() * 360),
        });
      }

      bullets = bullets.filter((b) => (b.y -= 470 * dt) > -12);
      for (const en of enemies) en.y += en.speed * dt;

      const gone = new Set<Bullet>();
      const alive: Enemy[] = [];
      for (const en of enemies) {
        let hit = false;
        for (const b of bullets) {
          if (!gone.has(b) && Math.abs(b.x - en.x) < 17 && Math.abs(b.y - en.y) < 17) {
            gone.add(b);
            hit = true;
            break;
          }
        }
        if (hit) points += 10 * level;
        else alive.push(en);
      }
      bullets = bullets.filter((b) => !gone.has(b));
      enemies = alive.filter((en) => {
        if (en.y >= BOARD_H - 70 && Math.abs(en.x - fx) < 26) {
          livesLeft -= 1;
          return false;
        }
        if (en.y > BOARD_H + 24) {
          livesLeft -= 1;
          return false;
        }
        return true;
      });
      syncLives();

      if (points !== shownScore) {
        shownScore = points;
        setScore(points);
      }

      draw();
      if (livesLeft <= 0) {
        dead = true;
        setMode("over");
        return;
      }
    };

    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "arrowright" || k === " " || k === "a" || k === "d") e.preventDefault();
      keys.add(k);
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const rectX = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return ((e.clientX - rect.left) / rect.width) * BOARD_W;
    };
    const pd = (e: PointerEvent) => {
      pointer.active = true;
      pointer.x = rectX(e);
    };
    const pm = (e: PointerEvent) => {
      if (pointer.active) pointer.x = rectX(e);
    };
    const pu = () => {
      pointer.active = false;
    };

    const tick = (now: number) => {
      if (now - lastTick < 12) return;
      lastTick = now;
      step(now);
      if (dead) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    watchdog = window.setInterval(() => {
      if (performance.now() - lastTick > 90) tick(performance.now());
    }, 50);

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    window.addEventListener("pointercancel", pu);

    return () => {
      window.clearInterval(watchdog);
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointerup", pu);
      window.removeEventListener("pointercancel", pu);
      canvas.removeEventListener("pointerdown", pd);
      canvas.removeEventListener("pointermove", pm);
    };
  }, [mode]);

  const start = () => {
    setError("");
    setSaved(false);
    setScore(0);
    setLives(3);
    setMode("playing");
  };

  const save = async (e: Event) => {
    e.preventDefault();
    setError("");
    try {
      await submit(name, score);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main class="flex flex-col items-center gap-4 pb-10">
      <header class="flex w-full max-w-[480px] items-baseline justify-between border-b border-neutral-700 pb-2">
        <h1>space shooter</h1>
        <small>
          {mode === "playing"
            ? `score ${score} · ${"♥".repeat(Math.max(0, lives))}`
            : "ship it"}
        </small>
      </header>
      <div class="relative w-full max-w-[480px]">
        <canvas
          ref={canvasRef}
          width={BOARD_W}
          height={BOARD_H}
          class="w-full border border-neutral-700"
        />
        {mode !== "playing" && (
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center">
            {mode === "menu" ? (
              <>
                <h2 class="mt-0">Space Shooter</h2>
                <p class="text-sm text-neutral-300">
                  ← → or A / D to steer · Space to shoot
                  <br />
                  on touch: drag anywhere on the field
                </p>
                <button onClick={start}>Start game</button>
              </>
            ) : (
              <>
                <h2 class="mt-0">Game over</h2>
                <p class="text-sm">
                  Score <b>{score}</b>
                </p>
                {!saved ? (
                  <form class="max-w-[320px]" onSubmit={save}>
                    <input
                      placeholder="Your name"
                      maxLength={16}
                      value={name}
                      onInput={(e) => setName(e.currentTarget.value)}
                      required
                    />
                    <button disabled={!name.trim()}>Save score</button>
                  </form>
                ) : (
                  <small>Saved to the leaderboard.</small>
                )}
                {error && (
                  <p class="text-sm" role="alert">
                    {error}
                  </p>
                )}
                <button class="subtle" onClick={start}>
                  Play again
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <section class="w-full max-w-[480px]">
        <h2>High scores</h2>
        {board === undefined ? (
          <p>Loading…</p>
        ) : board.length === 0 ? (
          <p>No scores yet — be the first.</p>
        ) : (
          <ul>
            {board.map((row, i) => (
              <li key={row.id}>
                <span class="pr-1">{i + 1}.</span>
                <span class="flex-1 text-left">{row.name}</span>
                <span>{row.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {error && mode !== "over" && (
        <p role="alert">{error}</p>
      )}
    </main>
  );
}
