// app/prescriptions/[patientId]/[appointmentId]/page.tsx
"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ref, onValue, update } from "firebase/database"
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"
import { db, storage } from "@/lib/firebase" // Adjust path as needed
import { type Doctor } from "@/types/opd-types" // Adjust path as needed
import PrescriptionCanvas from "@/components/prescription-canvas" // Adjust path as needed
import { Button } from "@/components/ui/button"
import { ChevronLeft, Save } from "lucide-react"
import { toast } from "react-toastify"

const LETTERHEAD_URL = "/letterhead.png" // Your letterhead URL

interface Appointment {
  id: string
  patientId: string
  patientName: string
  patientPhone: string
  date: string
  time: string
  doctor: string
  serviceName: string
  amount: number
  discount: number
  finalAmount: number
  paymentMethod: string
  isWalkIn: boolean
  createdAt: string
  prescriptionUrl?: string
}

const PrescriptionPage: React.FC = () => {
  const params = useParams()
  const router = useRouter()
  const patientId = params.patientId as string
  const appointmentId = params.appointmentId as string

  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [saving, setSaving] = useState(false)

  // Fetch doctors (needed for WhatsApp message)
  useEffect(() => {
    const doctorsRef = ref(db, "doctors")
    const unsubscribe = onValue(doctorsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const doctorsList: Doctor[] = Object.keys(data).map((key) => ({
          id: key,
          name: data[key].name,
          opdCharge: data[key].opdCharge || 0,
          specialty: data[key].specialty || "",
        }))
        setDoctors(doctorsList)
      }
    })
    return () => unsubscribe()
  }, [])

  // Fetch the specific appointment details
  useEffect(() => {
    if (!patientId || !appointmentId) return

    setLoading(true)
    const appointmentRef = ref(db, `patients/${patientId}/opd/${appointmentId}`)
    const unsubscribe = onValue(appointmentRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        // Fetch patient name from patient data separately if not in appointment
        const patientRef = ref(db, `patients/${patientId}`)
        onValue(patientRef, (patientSnapshot) => {
          const patientData = patientSnapshot.val()
          if (patientData) {
            setAppointment({
              id: appointmentId,
              patientId: patientId,
              patientName: patientData.name, // Use patient name from patient data
              patientPhone: patientData.phone, // Use patient phone from patient data
              ...data, // Spread existing appointment data
              amount: data.amount || 0,
              discount: data.discount || 0,
              finalAmount: data.finalAmount || data.amount || 0,
              isWalkIn: data.isWalkIn !== undefined ? data.isWalkIn : true,
            })
          } else {
            toast.error("Patient data not found.")
            setAppointment(null)
          }
          setLoading(false)
        }, { onlyOnce: true }) // Fetch patient data only once

      } else {
        toast.error("Appointment not found.")
        setAppointment(null)
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [patientId, appointmentId]) // Depend on patientId and appointmentId

  // Function to upload blob to Firebase Storage
  const uploadToFirebaseStorage = async (blob: Blob, filename: string): Promise<string> => {
    try {
      const fileRef = storageRef(storage, filename)
      await uploadBytes(fileRef, blob)
      return await getDownloadURL(fileRef)
    } catch (error) {
      console.error("Firebase Storage Upload Error:", error)
      throw new Error("Failed to upload file to storage.")
    }
  }

  const handleSavePrescription = async (canvasBlob: Blob) => {
    if (!appointment) return

    try {
      setSaving(true)

      // Create a unique filename
      const filename = `prescriptions/${appointment.patientId}_${appointment.id}_${Date.now()}.png`

      // Upload to Firebase Storage
      const imageUrl = await uploadToFirebaseStorage(canvasBlob, filename)

      // Update the appointment with the prescription URL
      const appointmentRef = ref(db, `patients/${appointment.patientId}/opd/${appointment.id}`)
      await update(appointmentRef, { prescriptionUrl: imageUrl })

      // Send WhatsApp message with prescription
      await sendPrescriptionWhatsApp(appointment, imageUrl)

      toast.success("Prescription saved and sent successfully!")
      router.back() // Navigate back after successful save
    } catch (error) {
      console.error("Error saving prescription:", error)
      toast.error(`Failed to save prescription: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const sendPrescriptionWhatsApp = async (appointmentData: Appointment, prescriptionUrl: string) => {
    try {
      // Basic validation
      if (!appointmentData.patientPhone || !prescriptionUrl) {
        console.warn("Skipping WhatsApp send: Missing phone or URL")
        return
      }

      const phoneWithCountryCode = `91${appointmentData.patientPhone.replace(/\D/g, "")}`
      const doctorName = doctors.find((d) => d.id === appointmentData.doctor)?.name || "Doctor"

      const message = `Hello ${appointmentData.patientName},

Your prescription from ${doctorName} at Gautami Hospital is ready.

Thank you for visiting us today!
Gautami Hospital`

      // Replace with your actual WhatsApp API call
      const response = await fetch("https://wa.medblisss.com/send-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "99583991572", // Your actual token
          number: phoneWithCountryCode,
          image: prescriptionUrl,
          caption: message,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json();
        console.error("WhatsApp API error:", response.status, errorData);
        throw new Error(`WhatsApp API failed: ${errorData.message || response.statusText}`);
      }

      // Optionally, log success or show a small notification
      console.log("WhatsApp message sent successfully.");

    } catch (error) {
      console.error("Error sending WhatsApp message:", error)
      // Decide if this error should prevent the whole save or just log
      // For now, it just logs, the prescription is still saved in Firebase
      toast.warn("Prescription saved, but failed to send via WhatsApp.")
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-500 border-r-transparent"></div>
        <p className="ml-2 text-gray-500">Loading appointment...</p>
      </div>
    )
  }

  if (!appointment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-red-500">
        <p>Error loading appointment details.</p>
        <Button onClick={() => router.back()} className="mt-4">
          <ChevronLeft className="h-4 w-4 mr-1" /> Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      <header className="flex items-center justify-between p-4 bg-white shadow-md dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Write Prescription for {appointment.patientName}
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <PrescriptionCanvas
          letterheadUrl={LETTERHEAD_URL}
          patientName={appointment.patientName}
          patientId={appointment.patientId}
          appointmentId={appointment.id}
          onSave={handleSavePrescription}
          saving={saving} // Pass saving state down
        />
      </div>
    </div>
  )
}

export default PrescriptionPage