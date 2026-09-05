"""Measure the native Mahjong AI profiles on the RetroPie runtime.

The benchmark intentionally uses the headless engine rather than Pygame so
that it measures AI and reducer work without HDMI, framebuffer, or rendering
noise.  It monkey-patches only the two engine entry points used by
``run_headless`` and restores them before returning.  The default run covers
easy, normal, hard, and god in both 2P and 4P; 4P also measures the production
mixed profile (god/normal/hard by seat).
"""

from __future__ import annotations

import argparse
import math
import os
import platform
import statistics
import sys
import time
from typing import Dict, List, Sequence

from . import engine


DEFAULT_ROUNDS = 20
DEFAULT_DECISION_SAMPLES = 500
PROFILE_ORDER = ("easy", "normal", "hard", "god")


def percentile(values: Sequence[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(math.ceil(len(ordered) * ratio)) - 1))
    return ordered[index]


def summarize(values: Sequence[float]) -> Dict[str, float]:
    if not values:
        return {"count": 0, "p50": 0.0, "p95": 0.0, "max": 0.0, "avg": 0.0}
    return {
        "count": float(len(values)),
        "p50": percentile(values, 0.50),
        "p95": percentile(values, 0.95),
        "max": max(values),
        "avg": statistics.mean(values),
    }


def measure_player_count(
    player_count: int,
    difficulty: str,
    rounds: int,
    decision_samples: int,
) -> Dict[str, object]:
    decision_ms: List[float] = []
    bot_step_ms: List[float] = []
    round_ms: List[float] = []
    outcomes: Dict[str, int] = {}

    original_choose = engine.choose_ai_discard
    original_step_bot = engine.step_bot

    def timed_choose(state, seat=1):
        started = time.perf_counter()
        result = original_choose(state, seat)
        elapsed = (time.perf_counter() - started) * 1000.0
        if int(seat) > 0 and len(decision_ms) < decision_samples:
            decision_ms.append(elapsed)
        return result

    def timed_step_bot(state):
        started = time.perf_counter()
        result = original_step_bot(state)
        bot_step_ms.append((time.perf_counter() - started) * 1000.0)
        return result

    engine.choose_ai_discard = timed_choose
    engine.step_bot = timed_step_bot
    try:
        for seed in range(1, max(1, rounds) + 1):
            started = time.perf_counter()
            result = engine.run_headless(
                seed=seed,
                player_count=player_count,
                ai_difficulty=difficulty,
            )
            round_ms.append((time.perf_counter() - started) * 1000.0)
            outcome = str(result.get("outcome", "unknown"))
            outcomes[outcome] = outcomes.get(outcome, 0) + 1
    finally:
        engine.choose_ai_discard = original_choose
        engine.step_bot = original_step_bot

    return {
        "player_count": player_count,
        "difficulty": difficulty,
        "rounds": rounds,
        "decision_ms": summarize(decision_ms),
        "bot_step_ms": summarize(bot_step_ms),
        "round_ms": summarize(round_ms),
        "outcomes": outcomes,
    }


def peak_memory_mb() -> float:
    try:
        import resource

        value = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        if sys.platform == "darwin":
            return value / (1024.0 * 1024.0)
        return value / 1024.0
    except (ImportError, AttributeError, OSError):
        return 0.0


def format_summary(summary: Dict[str, float]) -> str:
    return (
        "n={count} avg={avg:.4f} ms p50={p50:.4f} ms "
        "p95={p95:.4f} ms max={max:.4f} ms"
    ).format(**summary)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Benchmark RetroPie Mahjong AI profiles")
    parser.add_argument("--rounds", type=int, default=DEFAULT_ROUNDS)
    parser.add_argument("--decision-samples", type=int, default=DEFAULT_DECISION_SAMPLES)
    parser.add_argument(
        "--difficulty",
        choices=("all",) + PROFILE_ORDER + ("mixed",),
        default="all",
        help="profile to measure; all also includes production 4P mixed",
    )
    args = parser.parse_args(argv)

    print("RetroPie Mahjong AI performance benchmark")
    print("Python: {}".format(sys.version.split()[0]))
    print("Platform: {}".format(platform.platform()))
    print("CPU count: {}".format(os.cpu_count() or "unknown"))
    print("Peak RSS: {:.1f} MB".format(peak_memory_mb()))
    print("Rounds per profile: {}".format(max(1, args.rounds)))
    print("Decision sample cap per profile: {}".format(max(1, args.decision_samples)))

    for player_count in (2, 4):
        if args.difficulty == "all":
            difficulties = PROFILE_ORDER + (("mixed",) if player_count == 4 else ())
        else:
            difficulties = (args.difficulty,)
        for difficulty in difficulties:
            result = measure_player_count(
                player_count,
                difficulty,
                max(1, args.rounds),
                max(1, args.decision_samples),
            )
            print("{}P / {}".format(player_count, difficulty))
            print("  choose_ai_discard: {}".format(format_summary(result["decision_ms"])))
            print("  step_bot:          {}".format(format_summary(result["bot_step_ms"])))
            print("  full round:        {}".format(format_summary(result["round_ms"])))
            print("  outcomes: {}".format(result["outcomes"]))


if __name__ == "__main__":
    main()
