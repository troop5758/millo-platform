#!/usr/bin/env python3
"""
Example ML training script for bot/fraud classification (Adaptive Risk Engine).
Expects training_data.csv with columns: viewVelocity, deviceCluster, trustScore, engagementRatio, label.
Export from ModerationTrainingData or MlFeatureSnapshot + labels (e.g. from MongoDB or feature pipeline).
Output: bot_model.pkl (joblib-serialized RandomForestClassifier).
https://milloapp.com
"""
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
import joblib

# Load training data (export from ModerationTrainingData / MlFeatureSnapshot + labels)
data = pd.read_csv("training_data.csv")

feature_cols = ["viewVelocity", "deviceCluster", "trustScore", "engagementRatio"]
X = data[feature_cols].fillna(0)
y = data["label"]

model = RandomForestClassifier()
model.fit(X, y)

joblib.dump(model, "bot_model.pkl")
print("Saved bot_model.pkl")
