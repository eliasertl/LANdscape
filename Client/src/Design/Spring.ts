/**
 * Springs in the Carbon model: parameterised by `response` (seconds to reach
 * the target, roughly) and `dampingFraction` (1 = critically damped, < 1
 * bounces). Each frame uses the exact solution of the damped harmonic
 * oscillator for that frame's dt, so motion is frame-rate independent and a
 * retarget mid-flight keeps the current value and velocity.
 */
export interface SpringConfig {
  response: number;
  dampingFraction: number;
}

export const SPRING = {
  /** Most state changes: selection, expansion, window placement. */
  standard: { response: 0.3, dampingFraction: 1 } as SpringConfig,
  /** Small, fast feedback: hover, press, menus. */
  quick: { response: 0.18, dampingFraction: 1 } as SpringConfig,
  /** Slightly bouncy arrivals: sheets, a switch knob. */
  bounce: { response: 0.35, dampingFraction: 0.8 } as SpringConfig,
  /** Window open/close: fast but soft. */
  window: { response: 0.26, dampingFraction: 0.92 } as SpringConfig,
};

export interface SpringState {
  value: number;
  velocity: number;
}

/** Advances a spring toward `target` by `dt` seconds. */
export function advanceSpring(state: SpringState, target: number, dt: number, config: SpringConfig): SpringState {
  if (dt <= 0) return state;
  const omega = (2 * Math.PI) / Math.max(config.response, 0.001);
  const zeta = Math.max(config.dampingFraction, 0);
  const x0 = state.value - target;
  const v0 = state.velocity;
  let x: number;
  let v: number;

  if (zeta < 1) {
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega * dt);
    const c1 = x0;
    const c2 = (v0 + zeta * omega * x0) / omegaD;
    const cos = Math.cos(omegaD * dt);
    const sin = Math.sin(omegaD * dt);
    x = decay * (c1 * cos + c2 * sin);
    v = -zeta * omega * x + decay * (-c1 * omegaD * sin + c2 * omegaD * cos);
  } else if (zeta === 1) {
    const decay = Math.exp(-omega * dt);
    const c1 = x0;
    const c2 = v0 + omega * x0;
    x = (c1 + c2 * dt) * decay;
    v = (c2 - omega * (c1 + c2 * dt)) * decay;
  } else {
    const root = Math.sqrt(zeta * zeta - 1);
    const r1 = -omega * (zeta - root);
    const r2 = -omega * (zeta + root);
    const c2 = (v0 - r1 * x0) / (r2 - r1);
    const c1 = x0 - c2;
    const e1 = Math.exp(r1 * dt);
    const e2 = Math.exp(r2 * dt);
    x = c1 * e1 + c2 * e2;
    v = c1 * r1 * e1 + c2 * r2 * e2;
  }
  return { value: target + x, velocity: v };
}

export function isSpringAtRest(state: SpringState, target: number, tolerance = 0.01): boolean {
  return Math.abs(state.value - target) < tolerance && Math.abs(state.velocity) < tolerance * 10;
}

type Listener = (value: number) => void;

/** A single animated number driven by the shared frame loop. */
export class SpringValue {
  private state: SpringState;
  private target: number;
  private readonly listeners = new Set<Listener>();
  private restListeners: (() => void)[] = [];
  config: SpringConfig;
  tolerance: number;
  /** True while animating. */
  active = false;

  constructor(initial: number, config: SpringConfig = SPRING.standard, tolerance = 0.01) {
    this.state = { value: initial, velocity: 0 };
    this.target = initial;
    this.config = config;
    this.tolerance = tolerance;
  }

  get value(): number {
    return this.state.value;
  }

  get velocity(): number {
    return this.state.velocity;
  }

  get goal(): number {
    return this.target;
  }

  /** Animates toward a new target, keeping current value and velocity. */
  set(target: number, config?: SpringConfig): Promise<void> {
    if (config) this.config = config;
    this.target = target;
    if (reducedMotion()) {
      this.jump(target);
      return Promise.resolve();
    }
    if (isSpringAtRest(this.state, target, this.tolerance)) {
      this.jump(target);
      return Promise.resolve();
    }
    this.start();
    return new Promise((resolve) => this.restListeners.push(resolve));
  }

  /** Sets the value immediately without animation. */
  jump(value: number): void {
    this.target = value;
    this.state = { value, velocity: 0 };
    this.stop();
    this.emit();
    this.settle();
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called by the frame loop. Returns false once at rest. */
  step(dt: number): boolean {
    this.state = advanceSpring(this.state, this.target, dt, this.config);
    if (isSpringAtRest(this.state, this.target, this.tolerance)) {
      this.state = { value: this.target, velocity: 0 };
      this.emit();
      this.active = false;
      this.settle();
      return false;
    }
    this.emit();
    return true;
  }

  private start(): void {
    if (this.active) return;
    this.active = true;
    frameLoop.add(this);
  }

  private stop(): void {
    this.active = false;
    frameLoop.remove(this);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state.value);
  }

  private settle(): void {
    const listeners = this.restListeners;
    this.restListeners = [];
    for (const resolve of listeners) resolve();
  }
}

/** One requestAnimationFrame loop for every active spring. */
class FrameLoop {
  private readonly springs = new Set<SpringValue>();
  private frame: number | null = null;
  private last = 0;

  add(spring: SpringValue): void {
    this.springs.add(spring);
    if (this.frame === null) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  remove(spring: SpringValue): void {
    this.springs.delete(spring);
  }

  private readonly tick = (now: number): void => {
    // Cap dt so a background tab does not explode the solver.
    const dt = Math.min((now - this.last) / 1000, 0.064);
    this.last = now;
    for (const spring of this.springs) {
      if (!spring.step(dt)) this.springs.delete(spring);
    }
    this.frame = this.springs.size > 0 ? requestAnimationFrame(this.tick) : null;
  };
}

const frameLoop = new FrameLoop();

let reducedMotionQuery: MediaQueryList | null = null;
export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  reducedMotionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');
  return reducedMotionQuery.matches;
}
