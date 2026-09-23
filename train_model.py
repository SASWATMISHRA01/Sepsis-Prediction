"""
Sepsis Prediction Model Training
Trains a Random Forest classifier on synthetic clinical data.
"""

import os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, classification_report, confusion_matrix
)
import joblib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def train():
    print("=" * 60)
    print("  Training Sepsis Prediction Model")
    print("=" * 60)

    # Load dataset
    dataset_path = os.path.join(BASE_DIR, 'sepsis_dataset.csv')
    if not os.path.exists(dataset_path):
        print("\n  ERROR: sepsis_dataset.csv not found!")
        print("  Run generate_dataset.py first.")
        return

    df = pd.read_csv(dataset_path)
    print(f"\n  Loaded {len(df)} patient records")

    # Features and target
    feature_cols = [
        'age', 'gender', 'heart_rate', 'respiratory_rate', 'temperature',
        'systolic_bp', 'diastolic_bp', 'spo2', 'map',
        'wbc_count', 'lactate', 'creatinine', 'bilirubin',
        'platelet_count', 'glucose', 'crp', 'procalcitonin',
        'diabetes', 'immunosuppressed', 'recent_surgery',
        'chronic_lung_disease', 'prior_sepsis', 'qsofa_score'
    ]

    X = df[feature_cols]
    y = df['sepsis']

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"  Training set: {len(X_train)} samples")
    print(f"  Test set:     {len(X_test)} samples")
    print(f"  Sepsis rate:  {y.mean()*100:.1f}%")

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train Random Forest
    print("\n  Training Random Forest classifier...")
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=15,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train_scaled, y_train)

    # Predictions
    y_pred = model.predict(X_test_scaled)
    y_prob = model.predict_proba(X_test_scaled)[:, 1]

    # Metrics
    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    auc_roc = roc_auc_score(y_test, y_prob)

    print("\n" + "-" * 40)
    print("  Model Performance Metrics")
    print("-" * 40)
    print(f"  Accuracy:  {accuracy:.4f}")
    print(f"  Precision: {precision:.4f}")
    print(f"  Recall:    {recall:.4f}")
    print(f"  F1 Score:  {f1:.4f}")
    print(f"  AUC-ROC:   {auc_roc:.4f}")

    print(f"\n  Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(f"    TN={cm[0][0]}  FP={cm[0][1]}")
    print(f"    FN={cm[1][0]}  TP={cm[1][1]}")

    # Feature importance
    importances = model.feature_importances_
    feat_importance = sorted(
        zip(feature_cols, importances), key=lambda x: x[1], reverse=True
    )
    print("\n  Top 10 Feature Importances:")
    for i, (feat, imp) in enumerate(feat_importance[:10]):
        bar = "█" * int(imp * 100)
        print(f"    {i+1:2d}. {feat:<22s} {imp:.4f} {bar}")

    # Save model and scaler
    model_path = os.path.join(BASE_DIR, 'sepsis_model.pkl')
    scaler_path = os.path.join(BASE_DIR, 'scaler.pkl')
    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)

    print(f"\n  Model saved: {model_path}")
    print(f"  Scaler saved: {scaler_path}")
    print("=" * 60)

if __name__ == '__main__':
    train()