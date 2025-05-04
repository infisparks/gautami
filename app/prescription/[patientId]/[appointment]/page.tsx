"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import PrescriptionCanvas from "@/components/prescription-canvas"
import { db } from "@/lib/firebase"
import { ref, onValue, update, set } from "firebase/database"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

// Letterhead URL
const LETTERHEAD_URL = "/letter.png"

interface Patient {
  name: string
  phone: string
}

interface Appointment {
  id: string
  date: string
  time: string
  doctor: string
  serviceName: string
  isOPD: boolean
}

export default function PrescriptionPage({
  params,
}: {
  params: { patientId: string; appointmentId: string }
}) {
  const router = useRouter()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch patient data
        const patientRef = ref(db, `patients/${params.patientId}`)
        const unsubscribePatient = onValue(
          patientRef,
          (snapshot) => {
            const data = snapshot.val()
            if (data) {
              setPatient({
                name: data.name || "Unknown Patient",
                phone: data.phone || "",
              })
            } else {
              setError("Patient not found")
            }
          },
          (error) => {
            console.error("Error fetching patient:", error)
            setError("Failed to load patient data")
          },
        )

        // Fetch appointment data
        const appointmentRef = ref(db, `patients/${params.patientId}/opd/${params.appointmentId}`)
        const unsubscribeAppointment = onValue(
          appointmentRef,
          (snapshot) => {
            const data = snapshot.val()
            if (data) {
              setAppointment({
                id: params.appointmentId,
                date: data.date || new Date().toISOString().split("T")[0],
                time: data.time || "",
                doctor: data.doctor || "",
                serviceName: data.serviceName || "",
                isOPD: true,
              })
            } else {
              // Check if this might be an IP appointment
              const ipAppointmentRef = ref(db, `patients/${params.patientId}/ip/${params.appointmentId}`)
              onValue(
                ipAppointmentRef,
                (ipSnapshot) => {
                  const ipData = ipSnapshot.val()
                  if (ipData) {
                    setAppointment({
                      id: params.appointmentId,
                      date: ipData.date || new Date().toISOString().split("T")[0],
                      time: ipData.time || "",
                      doctor: ipData.doctor || "",
                      serviceName: ipData.serviceName || "",
                      isOPD: false,
                    })
                  } else {
                    // If appointment is not found, set a default appointment or null
                    setAppointment(null) // Allow prescription without appointment
                    setError("Appointment not found, but you can still create a prescription")
                  }
                  setLoading(false)
                },
                (error) => {
                  console.error("Error fetching IP appointment:", error)
                  setAppointment(null) // Allow prescription without appointment
                  setError("Failed to load appointment data, but you can still create a prescription")
                  setLoading(false)
                },
              )
            }
            setLoading(false)
          },
          (error) => {
            console.error("Error fetching OPD appointment:", error)
            setAppointment(null) // Allow prescription without appointment
            setError("Failed to load appointment data, but you can still create a prescription")
            setLoading(false)
          },
        )

        return () => {
          unsubscribePatient()
          unsubscribeAppointment()
        }
      } catch (err) {
        console.error("Error in data fetching:", err)
        setError("An unexpected error occurred, but you can still create a prescription")
        setLoading(false)
      }
    }

    fetchData()
  }, [params.patientId, params.appointmentId])

  const handleSavePrescription = async (imageUrl: string) => {
    try {
      if (!patient) {
        throw new Error("Patient data is missing")
      }

      if (appointment) {
        // Save prescription to existing appointment
        const appointmentPath = appointment.isOPD ? "opd" : "ip"
        const appointmentRef = ref(db, `patients/${params.patientId}/${appointmentPath}/${params.appointmentId}`)
        await update(appointmentRef, { prescriptionUrl: imageUrl })
      } else {
        // Save prescription to a general prescriptions node for the patient
        const prescriptionRef = ref(db, `patients/${params.patientId}/prescriptions/${params.appointmentId}`)
        await set(prescriptionRef, {
          prescriptionUrl: imageUrl,
          date: new Date().toISOString().split("T")[0],
          createdAt: new Date().toISOString(),
        })
      }

      // Send WhatsApp message with prescription if needed
      if (patient.phone) {
        await sendPrescriptionWhatsApp(patient.name, patient.phone, imageUrl)
      }

      // Navigate back to appointments page
      router.push("/appointments")
    } catch (error) {
      console.error("Error saving prescription:", error)
      alert("Failed to save prescription. Please try again.")
    }
  }

  const sendPrescriptionWhatsApp = async (patientName: string, patientPhone: string, prescriptionUrl: string) => {
    try {
      const phoneWithCountryCode = `91${patientPhone.replace(/\D/g, "")}`

      const message = `Hello ${patientName},

Your prescription from Gautami Hospital is ready.

Thank you for visiting us today!
Gautami Hospital`

      await fetch("https://wa.medblisss.com/send-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "99583991572",
          number: phoneWithCountryCode,
          image: prescriptionUrl,
          caption: message,
        }),
      })
    } catch (error) {
      console.error("Error sending WhatsApp message:", error)
      // Don't fail the entire operation if WhatsApp fails
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-500 border-r-transparent"></div>
        <p className="ml-2">Loading patient data...</p>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-red-500">Patient data is missing</p>
        <Button className="mt-4" onClick={() => router.push("/appointments")}>
          Return to Appointments
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b p-4 flex items-center">
        <Button variant="ghost" onClick={() => router.push("/appointments")} className="mr-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-xl font-semibold">
          Prescription for {patient.name} ({appointment ? (appointment.isOPD ? "OPD" : "IP") : "General"})
        </h1>
      </header>

      <main className="flex-1">
        {error && (
          <div className="p-4">
            <p className="text-yellow-500">{error}</p>
          </div>
        )}
        <PrescriptionCanvas
          letterheadUrl={LETTERHEAD_URL}
          patientName={patient.name}
          patientId={params.patientId}
          appointmentId={params.appointmentId}
          onSave={handleSavePrescription}
        />
      </main>
    </div>
  )
}