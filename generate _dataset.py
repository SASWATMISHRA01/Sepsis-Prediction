"""
Synthetic Clinical Dataset Generator for Sepsis Prediction
Generates ~2000 realistic patient records with vitals, labs, and medical history.
"""

import numpy as np
import pandas as pd
import os

np.random.seed(42)

NUM_PATIENTS = 2000

def generate_dataset():
    print("=" * 60)
    print("  Generating Synthetic Sepsis Dataset")
    print("=" * 60)

    # --- Vitals ---
    heart_rate = np.random.normal(85, 20, NUM_PATIENTS).clip(40, 180)
    respiratory_rate = np.random.normal(18, 5, NUM_PATIENTS).clip(8, 45)
    temperature = np.random.normal(37.0, 0.8, NUM_PATIENTS).clip(34.0, 42.0)
    systolic_bp = np.random.normal(120, 20, NUM_PATIENTS).clip(60, 200)
    diastolic_bp = np.random.normal(75, 12, NUM_PATIENTS).clip(40, 130)
    spo2 = np.random.normal(96, 3, NUM_PATIENTS).clip(70, 100)
    map_bp = diastolic_bp + (systolic_bp - diastolic_bp) / 3.0

    # --- Lab Values ---
    wbc_count = np.random.lognormal(2.2, 0.5, NUM_PATIENTS).clip(1, 50)
    lactate = np.random.lognormal(0.5, 0.6, NUM_PATIENTS).clip(0.3, 15)
    creatinine = np.random.lognormal(0.1, 0.5, NUM_PATIENTS).clip(0.3, 10)
    bilirubin = np.random.lognormal(0.0, 0.6, NUM_PATIENTS).clip(0.1, 20)
    platelet_count = np.random.normal(250, 80, NUM_PATIENTS).clip(10, 600)
    glucose = np.random.normal(110, 35, NUM_PATIENTS).clip(40, 400)
    crp = np.random.lognormal(1.5, 1.2, NUM_PATIENTS).clip(0.1, 300)
    procalcitonin = np.random.lognormal(-1.0, 1.5, NUM_PATIENTS).clip(0.01, 50)

    # --- Medical History (binary flags) ---
    diabetes = np.random.binomial(1, 0.15, NUM_PATIENTS)
    immunosuppressed = np.random.binomial(1, 0.08, NUM_PATIENTS)
    recent_surgery = np.random.binomial(1, 0.12, NUM_PATIENTS)
    chronic_lung_disease = np.random.binomial(1, 0.10, NUM_PATIENTS)
    prior_sepsis = np.random.binomial(1, 0.05, NUM_PATIENTS)

    # --- Demographics ---
    age = np.random.normal(55, 18, NUM_PATIENTS).clip(18, 95).astype(int)
    gender = np.random.choice([0, 1], NUM_PATIENTS)  # 0=Female, 1=Male

    # --- Calculate qSOFA score ---
    qsofa = (
        (respiratory_rate >= 22).astype(int) +
        (systolic_bp <= 100).astype(int) +
        (np.random.random(NUM_PATIENTS) < 0.15).astype(int)  # altered mentation proxy
    )

    # --- Sepsis Label (clinical heuristic) ---
    sepsis_score = np.zeros(NUM_PATIENTS)
    sepsis_score += (lactate > 2.0) * 2.0
    sepsis_score += (wbc_count > 12) * 1.5
    sepsis_score += (wbc_count < 4) * 1.5
    sepsis_score += (temperature > 38.3) * 1.0
    sepsis_score += (temperature < 36.0) * 1.0
    sepsis_score += (heart_rate > 100) * 1.0
    sepsis_score += (respiratory_rate > 22) * 1.0
    sepsis_score += (systolic_bp < 100) * 1.5
    sepsis_score += (crp > 50) * 1.0
    sepsis_score += (procalcitonin > 0.5) * 1.5
    sepsis_score += (platelet_count < 150) * 1.0
    sepsis_score += (creatinine > 2.0) * 1.0
    sepsis_score += (qsofa >= 2) * 2.0
    sepsis_score += immunosuppressed * 1.0
    sepsis_score += prior_sepsis * 1.0
    sepsis_score += recent_surgery * 0.5

    # Add some noise
    sepsis_score += np.random.normal(0, 1.0, NUM_PATIENTS)

    # Threshold for sepsis
    sepsis_label = (sepsis_score >= 5.0).astype(int)

    # Build DataFrame
    df = pd.DataFrame({
        'age': age,
        'gender': gender,
        'heart_rate': np.round(heart_rate, 1),
        'respiratory_rate': np.round(respiratory_rate, 1),
        'temperature': np.round(temperature, 2),
        'systolic_bp': np.round(systolic_bp, 1),
        'diastolic_bp': np.round(diastolic_bp, 1),
        'spo2': np.round(spo2, 1),
        'map': np.round(map_bp, 1),
        'wbc_count': np.round(wbc_count, 2),
        'lactate': np.round(lactate, 2),
        'creatinine': np.round(creatinine, 2),
        'bilirubin': np.round(bilirubin, 2),
        'platelet_count': np.round(platelet_count, 0),
        'glucose': np.round(glucose, 1),
        'crp': np.round(crp, 2),
        'procalcitonin': np.round(procalcitonin, 3),
        'diabetes': diabetes,
        'immunosuppressed': immunosuppressed,
        'recent_surgery': recent_surgery,
        'chronic_lung_disease': chronic_lung_disease,
        'prior_sepsis': prior_sepsis,
        'qsofa_score': qsofa,
        'sepsis': sepsis_label
    })

    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sepsis_dataset.csv')
    df.to_csv(output_path, index=False)

    print(f"\n  Dataset generated: {output_path}")
    print(f"  Total patients: {len(df)}")
    print(f"  Sepsis positive: {sepsis_label.sum()} ({sepsis_label.mean()*100:.1f}%)")
    print(f"  Sepsis negative: {(1 - sepsis_label).sum()} ({(1 - sepsis_label).mean()*100:.1f}%)")
    print(f"\n  Feature columns: {len(df.columns) - 1}")
    print(f"  Features: {', '.join(df.columns[:-1])}")
    print("=" * 60)

    return df

if __name__ == '__main__':
    generate_dataset()