#!/usr/bin/env python3
"""
Manual training script.

Run this to train models from the command line:
    python scripts/train.py

Or with custom days:
    python scripts/train.py --days 60
"""

import sys
import argparse
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.model import PredictionEngine


def main():
    parser = argparse.ArgumentParser(description="Train glucose prediction models")
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Number of days of historical data to use (default: 30)",
    )
    args = parser.parse_args()

    print("Initializing prediction engine...")
    engine = PredictionEngine()

    print(f"Training models using {args.days} days of data...")
    try:
        results = engine.train_all(days=args.days)

        print("\n" + "=" * 60)
        print("Training Complete!")
        print("=" * 60)

        for horizon, metrics in results.items():
            print(f"\n{horizon}-minute model:")
            print(f"  Training samples: {metrics['training_samples']}")
            print(f"  MAE: {metrics['mae']:.2f} mmol/L")
            print(f"  RMSE: {metrics['rmse']:.2f} mmol/L")
            print(f"  R²: {metrics['r2']:.3f}")

    except ValueError as e:
        print(f"\nError: {e}")
        print("You need more data before training can begin.")
        sys.exit(1)


if __name__ == "__main__":
    main()
