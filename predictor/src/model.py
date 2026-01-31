"""
Linear regression model for glucose prediction.

This is a simple starting point that can be upgraded to more sophisticated
models (Ridge, XGBoost, neural networks) as you learn what works best.
"""

import os
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timezone
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from typing import Optional

from .config import get_settings
from .database import fetch_all_data
from .features import engineer_features, prepare_training_data, get_feature_columns


# Where to store trained models
MODELS_DIR = Path(__file__).parent.parent / "models"


class GlucosePredictor:
    """
    A linear regression model for predicting future glucose values.
    
    Key concepts:
    - Uses Ridge regression (linear regression with regularization)
    - StandardScaler normalizes features to similar scales
    - Separate models for each prediction horizon (30, 60, 90, 120 min)
    
    Why Ridge over plain LinearRegression?
    - More stable when features are correlated
    - Less prone to overfitting
    - Still very interpretable
    """

    def __init__(self, horizon: int):
        """
        Initialize predictor for a specific time horizon.
        
        Args:
            horizon: Minutes into the future to predict (e.g., 30, 60)
        """
        self.horizon = horizon
        self.model: Optional[Ridge] = None
        self.scaler: Optional[StandardScaler] = None
        self.feature_columns = get_feature_columns()
        self.trained_at: Optional[datetime] = None
        self.metrics: dict = {}

    def train(self, X: pd.DataFrame, y: pd.Series) -> dict:
        """
        Train the model on provided data.
        
        Args:
            X: Feature DataFrame
            y: Target Series (future glucose values)
        
        Returns:
            Dictionary of training metrics
        """
        # Split into train/test (80/20)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        # Scale features
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)

        # Train Ridge regression
        # alpha=1.0 is the regularization strength (higher = more regularization)
        self.model = Ridge(alpha=1.0)
        self.model.fit(X_train_scaled, y_train)

        # Evaluate on test set
        y_pred = self.model.predict(X_test_scaled)

        self.metrics = {
            "horizon_minutes": self.horizon,
            "training_samples": len(X_train),
            "test_samples": len(X_test),
            "mae": float(mean_absolute_error(y_test, y_pred)),  # mmol/L
            "rmse": float(np.sqrt(mean_squared_error(y_test, y_pred))),
            "r2": float(r2_score(y_test, y_pred)),
        }

        self.trained_at = datetime.now(timezone.utc)

        return self.metrics

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """
        Make predictions for new data.
        
        Args:
            X: Feature DataFrame (must have same columns as training)
        
        Returns:
            Array of predicted glucose values (mmol/L)
        """
        if self.model is None or self.scaler is None:
            raise ValueError("Model not trained. Call train() first.")

        X_scaled = self.scaler.transform(X[self.feature_columns])
        return self.model.predict(X_scaled)

    def predict_single(self, features: dict) -> float:
        """
        Predict for a single data point.
        
        Args:
            features: Dictionary with feature values
        
        Returns:
            Predicted glucose value (mmol/L)
        """
        X = pd.DataFrame([features])
        return float(self.predict(X)[0])

    def save(self, path: Optional[Path] = None) -> Path:
        """
        Save model to disk.
        
        Uses joblib format which is efficient for sklearn models.
        """
        if path is None:
            MODELS_DIR.mkdir(exist_ok=True)
            path = MODELS_DIR / f"glucose_{self.horizon}min.joblib"

        model_data = {
            "model": self.model,
            "scaler": self.scaler,
            "horizon": self.horizon,
            "feature_columns": self.feature_columns,
            "trained_at": self.trained_at,
            "metrics": self.metrics,
        }

        joblib.dump(model_data, path)
        return path

    @classmethod
    def load(cls, horizon: int, path: Optional[Path] = None) -> "GlucosePredictor":
        """
        Load a trained model from disk.
        
        Args:
            horizon: The prediction horizon of the model to load
            path: Optional custom path (default: models/glucose_{horizon}min.joblib)
        """
        if path is None:
            path = MODELS_DIR / f"glucose_{horizon}min.joblib"

        if not path.exists():
            raise FileNotFoundError(f"No trained model found at {path}")

        model_data = joblib.load(path)

        predictor = cls(horizon)
        predictor.model = model_data["model"]
        predictor.scaler = model_data["scaler"]
        predictor.feature_columns = model_data["feature_columns"]
        predictor.trained_at = model_data["trained_at"]
        predictor.metrics = model_data["metrics"]

        return predictor

    def get_feature_importance(self) -> dict[str, float]:
        """
        Get feature importance (coefficient magnitudes).
        
        Larger absolute values = more important features.
        Sign indicates direction: positive = raises glucose, negative = lowers.
        """
        if self.model is None:
            return {}

        importance = {}
        for name, coef in zip(self.feature_columns, self.model.coef_):
            importance[name] = float(coef)

        # Sort by absolute importance
        return dict(
            sorted(importance.items(), key=lambda x: abs(x[1]), reverse=True)
        )


class PredictionEngine:
    """
    Manager for multiple horizon models.
    
    Handles training and predictions for all configured horizons.
    """

    def __init__(self):
        self.settings = get_settings()
        self.models: dict[int, GlucosePredictor] = {}
        self._load_models()

    def _load_models(self):
        """Load any existing trained models."""
        for horizon in self.settings.horizons:
            try:
                self.models[horizon] = GlucosePredictor.load(horizon)
                print(f"Loaded model for {horizon}-minute predictions")
            except FileNotFoundError:
                print(f"No trained model found for {horizon}-minute predictions")

    def train_all(self, days: int = 30) -> dict[int, dict]:
        """
        Train models for all horizons using recent data.
        
        Args:
            days: Number of days of historical data to use
        
        Returns:
            Dictionary mapping horizon -> training metrics
        """
        print(f"Fetching {days} days of training data...")
        data = fetch_all_data()

        print("Engineering features...")
        df = engineer_features(data, horizons=self.settings.horizons)

        if len(df) < self.settings.min_training_rows:
            raise ValueError(
                f"Not enough data for training. Have {len(df)} rows, "
                f"need {self.settings.min_training_rows}"
            )

        results = {}
        for horizon in self.settings.horizons:
            print(f"Training {horizon}-minute model...")
            X, y = prepare_training_data(df, horizon)

            if len(X) < 100:
                print(f"  Skipping: not enough valid samples ({len(X)})")
                continue

            predictor = GlucosePredictor(horizon)
            metrics = predictor.train(X, y)
            predictor.save()

            self.models[horizon] = predictor
            results[horizon] = metrics

            print(f"  MAE: {metrics['mae']:.2f} mmol/L")
            print(f"  R²: {metrics['r2']:.3f}")

        return results

    def predict(self, features: dict, horizon: int = None) -> dict:
        """
        Make predictions for given features.
        
        Args:
            features: Dictionary of current feature values
            horizon: Specific horizon to predict (None = all)
        
        Returns:
            Dictionary mapping horizon -> predicted glucose
        """
        horizons = [horizon] if horizon else self.settings.horizons
        predictions = {}

        for h in horizons:
            if h not in self.models:
                continue
            try:
                predictions[h] = self.models[h].predict_single(features)
            except Exception as e:
                print(f"Prediction error for {h}min: {e}")

        return predictions

    def get_status(self) -> dict:
        """Get status of all models."""
        return {
            "horizons": self.settings.horizons,
            "trained_models": {
                h: {
                    "trained_at": m.trained_at.isoformat() if m.trained_at else None,
                    "metrics": m.metrics,
                }
                for h, m in self.models.items()
            },
            "untrained_horizons": [
                h for h in self.settings.horizons if h not in self.models
            ],
        }
