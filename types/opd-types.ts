export interface IFormInput {
  name: string
  phone: string
  age: number
  gender: string
  address?: string
  date: Date
  time: string
  message?: string
  paymentMethod: string
  amount: number
  serviceName: string
  doctor: string
  discount: number
  isWalkIn: boolean
  isOnCall: boolean
}

export interface PatientRecord {
  id: string
  name: string
  phone: string
  age?: number
  gender?: string
  address?: string
  createdAt?: string
  opd?: any // Extra subfields
}

// Minimal patient record from Medford Family
export interface MedfordPatient {
  patientId: string
  name: string
  contact: string
  dob: string
  gender: string
  hospitalName: string
}

// Combined patient type for auto‑suggestions
export interface CombinedPatient {
  id: string
  name: string
  phone?: string
  source: "gautami" | "other"
  data: PatientRecord | MedfordPatient
}

export interface Doctor {
  id: string
  name: string
  opdCharge: number
  specialty?: string
}

export interface OnCallPatient {
  id: string
  name: string
  phone: string
  age?: number
  gender?: string
  message?: string
  serviceName?: string
  doctor?: string
  createdAt: string
}

export const PaymentOptions = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
]

export const GenderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
]

/**
 * Utility function: Format a Date to 12‑hour time with AM/PM
 */
export function formatAMPM(date: Date): string {
  let hours = date.getHours()
  let minutes: string | number = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12 // the hour '0' should be '12'
  minutes = minutes < 10 ? "0" + minutes : minutes
  return `${hours}:${minutes} ${ampm}`
}

/** Helper function to generate a 10‑character alphanumeric UHID */
export function generatePatientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
