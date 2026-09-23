"""
FastAPI Backend for Sepsis Prediction System
Serves REST APIs and static frontend files.
"""

import os
import random
import numpy as np
import pandas as pd
import joblib
from datetime import datetime, timedelta
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, HTTPException
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.staticfiles import StaticFiles
# pyrefly: ignore [missing-import]
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(title="Sepsis Prediction API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global State ──
model = None
scaler = None
patients_db = []
feature_cols = [
    'age', 'gender', 'heart_rate', 'respiratory_rate', 'temperature',
    'systolic_bp', 'diastolic_bp', 'spo2', 'map',
    'wbc_count', 'lactate', 'creatinine', 'bilirubin',
    'platelet_count', 'glucose', 'crp', 'procalcitonin',
    'diabetes', 'immunosuppressed', 'recent_surgery',
    'chronic_lung_disease', 'prior_sepsis', 'qsofa_score'
]

DASHBOARD_PATIENT_COUNT = 250
DASHBOARD_SEPSIS_SHARE = 0.55

first_names = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
    "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Charles", "Karen", "Daniel", "Lisa", "Matthew", "Nancy",
    "Anthony", "Betty", "Mark", "Margaret", "Donald", "Sandra", "Steven", "Ashley",
    "Paul", "Dorothy", "Andrew", "Kimberly", "Joshua", "Emily", "Kenneth", "Donna",
    "Arun", "Priya", "Rahul", "Anita", "Vikram", "Sunita", "Amit", "Deepa",
    "Raj", "Meera", "Christopher", "Michelle", "Kevin", "Amanda", "Brian", "Melissa",
    "George", "Deborah", "Edward", "Stephanie", "Ronald", "Rebecca", "Timothy", "Sharon",
    "Jason", "Laura", "Jeffrey", "Cynthia", "Ryan", "Kathleen", "Jacob", "Amy",
    "Gary", "Angela", "Nicholas", "Shirley", "Eric", "Anna", "Jonathan", "Brenda",
    "Stephen", "Pamela", "Larry", "Emma", "Justin", "Nicole", "Scott", "Helen",
    "Brandon", "Samantha", "Benjamin", "Katherine", "Samuel", "Christine", "Raymond", "Debra",
    "Ananya", "Rohan", "Kavya", "Nikhil", "Isha", "Sanjay", "Neha", "Karan",
    "Pooja", "Aditya", "Sneha", "Manish", "Divya", "Harsh", "Ritu", "Siddharth",
    "Fatima", "Omar", "Aisha", "Hassan", "Noor", "Wei", "Mei", "Chen",
    "Yuki", "Hiroshi", "Sofia", "Lucas", "Elena", "Diego", "Amara", "Kwame",
]

last_names = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
    "Sharma", "Patel", "Singh", "Kumar", "Gupta", "Verma", "Mehta", "Joshi",
    "Rao", "Nair", "Walker", "Young", "Allen", "King", "Wright", "Scott",
    "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker",
    "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts", "Iyer", "Reddy",
    "Chopra", "Banerjee", "Desai", "Malhotra", "Kapoor", "Agarwal", "Khan", "Hussain",
    "Ahmed", "Ali", "Chen", "Wang", "Kim", "Park", "Tanaka", "Yamamoto",
    "Costa", "Silva", "Rossi", "Muller", "Dubois", "Okafor", "Mensah", "Abebe",
]


class PredictionInput(BaseModel):
    age: float
    gender: int
    heart_rate: float
    respiratory_rate: float
    temperature: float
    systolic_bp: float
    diastolic_bp: float
    spo2: float
    wbc_count: float
    lactate: float
    creatinine: float
    bilirubin: float
    platelet_count: float
    glucose: float
    crp: float
    procalcitonin: float
    diabetes: int = 0
    immunosuppressed: int = 0
    recent_surgery: int = 0
    chronic_lung_disease: int = 0
    prior_sepsis: int = 0


def generate_vitals_history(base_hr, base_temp, base_rr, base_sbp, base_spo2, risk):
    """Generate 24 hours of vitals history (hourly readings)."""
    history = []
    now = datetime.now()
    for i in range(24):
        t = now - timedelta(hours=23 - i)
        # Add trending deterioration for high-risk patients
        drift = (i / 24.0) * risk * 0.3
        noise_hr = random.gauss(0, 3)
        noise_temp = random.gauss(0, 0.15)
        noise_rr = random.gauss(0, 1.5)
        noise_sbp = random.gauss(0, 5)
        noise_spo2 = random.gauss(0, 0.8)

        history.append({
            "time": t.strftime("%H:%M"),
            "hour": i,
            "heart_rate": round(base_hr + drift * 15 + noise_hr, 1),
            "temperature": round(base_temp + drift * 0.8 + noise_temp, 2),
            "respiratory_rate": round(base_rr + drift * 5 + noise_rr, 1),
            "systolic_bp": round(base_sbp - drift * 10 + noise_sbp, 1),
            "spo2": round(max(70, base_spo2 - drift * 3 + noise_spo2), 1),
        })
    return history


def _unique_name(used_names):
    for _ in range(500):
        name = f"{random.choice(first_names)} {random.choice(last_names)}"
        if name not in used_names:
            used_names.add(name)
            return name
    name = f"{random.choice(first_names)} {random.choice(last_names)} {len(used_names) + 1}"
    used_names.add(name)
    return name


def _unique_room(used_rooms):
    for _ in range(500):
        room = f"{random.choice(['A', 'B', 'C', 'D', 'E', 'F'])}{random.randint(100, 499)}"
        if room not in used_rooms:
            used_rooms.add(room)
            return room
    room = f"G{len(used_rooms) + 100}"
    used_rooms.add(room)
    return room


def _select_dashboard_patients(df):
    """Pull more ward patients from the CSV, with extra sepsis-positive cases."""
    target = min(DASHBOARD_PATIENT_COUNT, len(df))
    if "sepsis" not in df.columns:
        return df.head(target)

    pos = df[df["sepsis"] == 1]
    neg = df[df["sepsis"] == 0]
    n_pos = min(len(pos), max(1, int(round(target * DASHBOARD_SEPSIS_SHARE))))
    n_neg = min(len(neg), target - n_pos)
    if n_pos + n_neg < target:
        leftover = target - n_pos - n_neg
        extra_pos = min(len(pos) - n_pos, leftover)
        n_pos += extra_pos
        leftover -= extra_pos
        n_neg += min(len(neg) - n_neg, leftover)

    parts = []
    if n_pos > 0:
        parts.append(pos.sample(n=n_pos, random_state=42))
    if n_neg > 0:
        parts.append(neg.sample(n=n_neg, random_state=42))
    if not parts:
        return df.head(target)
    return pd.concat(parts).sample(frac=1, random_state=42).reset_index(drop=True)


def load_model_and_data():
    """Load trained model and generate patient database."""
    global model, scaler, patients_db

    model_path = os.path.join(BASE_DIR, 'sepsis_model.pkl')
    scaler_path = os.path.join(BASE_DIR, 'scaler.pkl')

    if os.path.exists(model_path) and os.path.exists(scaler_path):
        model = joblib.load(model_path)
        scaler = joblib.load(scaler_path)
        print("  [OK] Model and scaler loaded successfully")
    else:
        print("  [ERROR] Model files not found! Run train_model.py first.")
        return

    # Load dataset and create patient records
    dataset_path = os.path.join(BASE_DIR, 'sepsis_dataset.csv')
    if os.path.exists(dataset_path):
        df = pd.read_csv(dataset_path)
        sample = _select_dashboard_patients(df)
        sepsis_in_sample = int(sample["sepsis"].sum()) if "sepsis" in sample.columns else 0
        print(
            f"  [OK] Dashboard sample: {len(sample)} patients "
            f"({sepsis_in_sample} sepsis-positive from dataset)"
        )

        patients_db = []
        used_names = set()
        used_rooms = set()

        features_scaled = scaler.transform(sample[feature_cols])
        risk_probs = model.predict_proba(features_scaled)[:, 1]

        for seq, ((_, row), risk_prob) in enumerate(
            zip(sample.iterrows(), risk_probs), start=1
        ):
            risk_prob = float(risk_prob)
            patient = {
                "id": seq,
                "name": _unique_name(used_names),
                "age": int(row['age']),
                "gender": "Male" if row['gender'] == 1 else "Female",
                "room": _unique_room(used_rooms),
                "admitted": (datetime.now() - timedelta(days=random.randint(0, 14), hours=random.randint(0, 23))).strftime("%Y-%m-%d %H:%M"),
                "risk_score": round(risk_prob * 100, 1),
                "risk_level": (
                    "Critical" if risk_prob > 0.7 else
                    "High" if risk_prob > 0.5 else
                    "Moderate" if risk_prob > 0.3 else
                    "Low"
                ),
                "vitals": {
                    "heart_rate": float(row['heart_rate']),
                    "respiratory_rate": float(row['respiratory_rate']),
                    "temperature": float(row['temperature']),
                    "systolic_bp": float(row['systolic_bp']),
                    "diastolic_bp": float(row['diastolic_bp']),
                    "spo2": float(row['spo2']),
                    "map": float(row['map']),
                },
                "labs": {
                    "wbc_count": float(row['wbc_count']),
                    "lactate": float(row['lactate']),
                    "creatinine": float(row['creatinine']),
                    "bilirubin": float(row['bilirubin']),
                    "platelet_count": float(row['platelet_count']),
                    "glucose": float(row['glucose']),
                    "crp": float(row['crp']),
                    "procalcitonin": float(row['procalcitonin']),
                },
                "history": {
                    "diabetes": bool(row['diabetes']),
                    "immunosuppressed": bool(row['immunosuppressed']),
                    "recent_surgery": bool(row['recent_surgery']),
                    "chronic_lung_disease": bool(row['chronic_lung_disease']),
                    "prior_sepsis": bool(row['prior_sepsis']),
                },
                "qsofa_score": int(row['qsofa_score']),
            }
            patients_db.append(patient)

        print(f"  [OK] Generated {len(patients_db)} patient records for dashboard")
    else:
        print("  [ERROR] Dataset not found!")


@app.on_event("startup")
async def startup():
    print("\n" + "=" * 50)
    print("  Sepsis Prediction System - Starting Up")
    print("=" * 50)
    load_model_and_data()
    print("=" * 50 + "\n")


# ── API Routes ──

@app.get("/api/stats")
async def get_stats():
    if not patients_db:
        return {"total": 0, "high_risk": 0, "avg_risk": 0, "alerts": 0}

    total = len(patients_db)
    high_risk = sum(1 for p in patients_db if p["risk_score"] > 50)
    avg_risk = round(sum(p["risk_score"] for p in patients_db) / total, 1)
    critical = sum(1 for p in patients_db if p["risk_score"] > 70)

    return {
        "total_patients": total,
        "high_risk": high_risk,
        "avg_risk": avg_risk,
        "critical_alerts": critical,
        "low_risk": sum(1 for p in patients_db if p["risk_score"] <= 30),
        "moderate_risk": sum(1 for p in patients_db if 30 < p["risk_score"] <= 50),
    }


def _ensure_vitals_history(patient):
    if patient.get("vitals_history"):
        return patient
    vitals = patient["vitals"]
    patient["vitals_history"] = generate_vitals_history(
        vitals["heart_rate"], vitals["temperature"],
        vitals["respiratory_rate"], vitals["systolic_bp"],
        vitals["spo2"], patient["risk_score"] / 100.0,
    )
    return patient


@app.get("/api/patients")
async def get_patients():
    ranked = sorted(patients_db, key=lambda x: x["risk_score"], reverse=True)
    return [{k: v for k, v in p.items() if k != "vitals_history"} for p in ranked]


@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: int):
    for p in patients_db:
        if p["id"] == patient_id:
            return _ensure_vitals_history(p)
    raise HTTPException(status_code=404, detail="Patient not found")


@app.get("/api/alerts")
async def get_alerts():
    alerts = []
    for p in patients_db:
        if p["risk_score"] > 50:
            severity = "critical" if p["risk_score"] > 70 else "warning"
            alerts.append({
                "id": p["id"],
                "patient_name": p["name"],
                "room": p["room"],
                "risk_score": p["risk_score"],
                "risk_level": p["risk_level"],
                "severity": severity,
                "message": f"{'CRITICAL' if severity == 'critical' else 'WARNING'}: {p['name']} (Room {p['room']}) - Sepsis risk at {p['risk_score']}%",
                "time": (datetime.now() - timedelta(minutes=random.randint(1, 120))).strftime("%H:%M"),
            })
    return sorted(alerts, key=lambda x: x["risk_score"], reverse=True)


@app.post("/api/predict")
async def predict_sepsis(data: PredictionInput):
    if model is None or scaler is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    # Calculate derived features
    map_val = data.diastolic_bp + (data.systolic_bp - data.diastolic_bp) / 3.0
    qsofa = int(data.respiratory_rate >= 22) + int(data.systolic_bp <= 100)

    features = np.array([[
        data.age, data.gender, data.heart_rate, data.respiratory_rate,
        data.temperature, data.systolic_bp, data.diastolic_bp, data.spo2, map_val,
        data.wbc_count, data.lactate, data.creatinine, data.bilirubin,
        data.platelet_count, data.glucose, data.crp, data.procalcitonin,
        data.diabetes, data.immunosuppressed, data.recent_surgery,
        data.chronic_lung_disease, data.prior_sepsis, qsofa
    ]])

    features_df = pd.DataFrame(features, columns=feature_cols)
    features_scaled = scaler.transform(features_df)
    probability = float(model.predict_proba(features_scaled)[0][1])
    risk_score = round(probability * 100, 1)

    risk_level = (
        "Critical" if risk_score > 70 else
        "High" if risk_score > 50 else
        "Moderate" if risk_score > 30 else
        "Low"
    )

    # Key risk factors
    risk_factors = []
    if data.lactate > 2.0:
        risk_factors.append(f"Elevated lactate ({data.lactate} mmol/L)")
    if data.wbc_count > 12 or data.wbc_count < 4:
        risk_factors.append(f"Abnormal WBC count ({data.wbc_count} K/μL)")
    if data.temperature > 38.3 or data.temperature < 36.0:
        risk_factors.append(f"Abnormal temperature ({data.temperature}°C)")
    if data.heart_rate > 100:
        risk_factors.append(f"Tachycardia (HR: {data.heart_rate})")
    if data.systolic_bp < 100:
        risk_factors.append(f"Hypotension (SBP: {data.systolic_bp})")
    if data.crp > 50:
        risk_factors.append(f"Elevated CRP ({data.crp} mg/L)")
    if data.procalcitonin > 0.5:
        risk_factors.append(f"Elevated procalcitonin ({data.procalcitonin} ng/mL)")
    if data.spo2 < 92:
        risk_factors.append(f"Low SpO2 ({data.spo2}%)")
    if qsofa >= 2:
        risk_factors.append(f"qSOFA score ≥ 2 ({qsofa})")

    recommendations = []
    if risk_score > 70:
        recommendations = [
            "Immediate blood cultures and lactate measurement",
            "Start broad-spectrum antibiotics within 1 hour",
            "Aggressive IV fluid resuscitation (30 mL/kg)",
            "Continuous hemodynamic monitoring",
            "ICU consultation recommended",
        ]
    elif risk_score > 50:
        recommendations = [
            "Obtain blood cultures before antibiotics",
            "Start empiric antibiotics within 3 hours",
            "IV fluid bolus and reassess",
            "Repeat lactate within 2-4 hours",
            "Increase monitoring frequency to q1h",
        ]
    elif risk_score > 30:
        recommendations = [
            "Monitor vitals every 2 hours",
            "Repeat labs in 4-6 hours",
            "Assess for source of infection",
            "Consider blood cultures if clinically indicated",
        ]
    else:
        recommendations = [
            "Continue routine monitoring",
            "Repeat assessment in 8-12 hours",
        ]

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "probability": round(probability, 4),
        "risk_factors": risk_factors,
        "recommendations": recommendations,
        "qsofa_score": qsofa,
        "map": round(map_val, 1),
    }


# ── Serve Frontend ──
@app.get("/")
async def serve_index():
    index_path = os.path.join(BASE_DIR, "index.html")
    return FileResponse(index_path)


@app.get("/{filename}")
async def serve_static(filename: str):
    filepath = os.path.join(BASE_DIR, filename)
    if os.path.exists(filepath) and not os.path.isdir(filepath):
        return FileResponse(filepath)
    raise HTTPException(status_code=404, detail="File not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)