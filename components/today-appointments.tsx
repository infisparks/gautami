"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { db } from "@/lib/firebase"
import { ref, onValue } from "firebase/database"
import { Calendar, Clock, User, Phone, DollarSign, FileText } from "lucide-react"
import { CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type Doctor, PaymentOptions } from "@/types/opd-types"

// Import your letterhead
const LETTERHEAD_URL = "/letterhead.png"

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

const TodayAppointments: React.FC = () => {
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)

  // Get today's date in YYYY-MM-DD format for comparison
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split("T")[0]

  // Fetch doctors for reference
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
        doctorsList.unshift({ id: "no_doctor", name: "No Doctor", opdCharge: 0 })
        setDoctors(doctorsList)
      } else {
        setDoctors([{ id: "no_doctor", name: "No Doctor", opdCharge: 0 }])
      }
    })
    return () => unsubscribe()
  }, [])

  // Fetch all patients and their appointments
  useEffect(() => {
    setLoading(true)
    const patientsRef = ref(db, "patients")
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val()
      const todayAppointments: Appointment[] = []

      if (data) {
        // Loop through all patients
        for (const patientId in data) {
          const patient = data[patientId]

          // Check if patient has OPD appointments
          if (patient.opd) {
            // Loop through all appointments for this patient
            for (const appointmentId in patient.opd) {
              const appointment = patient.opd[appointmentId]

              // Check if appointment is for today
              const appointmentDate = new Date(appointment.date)
              appointmentDate.setHours(0, 0, 0, 0)
              const appointmentDateStr = appointmentDate.toISOString().split("T")[0]

              if (appointmentDateStr === todayStr) {
                todayAppointments.push({
                  id: appointmentId,
                  patientId,
                  patientName: patient.name,
                  patientPhone: patient.phone,
                  date: appointment.date,
                  time: appointment.time,
                  doctor: appointment.doctor,
                  serviceName: appointment.serviceName,
                  amount: appointment.amount || 0,
                  discount: appointment.discount || 0,
                  finalAmount: appointment.finalAmount || appointment.amount || 0,
                  paymentMethod: appointment.paymentMethod,
                  isWalkIn: appointment.isWalkIn !== undefined ? appointment.isWalkIn : true,
                  createdAt: appointment.createdAt,
                  prescriptionUrl: appointment.prescriptionUrl,
                })
              }
            }
          }
        }

        // Sort appointments by time
        todayAppointments.sort((a, b) => {
          // First convert time strings to comparable values
          const timeA = convertTimeToMinutes(a.time)
          const timeB = convertTimeToMinutes(b.time)
          return timeA - timeB
        })

        setAppointments(todayAppointments)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [todayStr])

  // Helper function to convert time string (e.g., "10:30 AM") to minutes for sorting
  const convertTimeToMinutes = (timeStr: string): number => {
    try {
      const [timePart, ampm] = timeStr.split(" ")
      const [hours, minutes] = timePart.split(":").map(Number)
      return hours * 60 + minutes
    } catch (e) {
      return 0 // Default value if parsing fails
    }
  }

  const handleWritePrescription = (appointment: Appointment) => {
    // Navigate to the prescription page instead of opening a dialog
    router.push(`/prescription/${appointment.patientId}/${appointment.id}`)
  }

  const viewPrescription = (prescriptionUrl: string) => {
    window.open(prescriptionUrl, "_blank")
  }

  return (
    <CardContent className="p-6">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
            Todays Appointments ({appointments.length})
          </h3>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-emerald-600" />
            <span className="font-medium">{today.toLocaleDateString()}</span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-500 border-r-transparent"></div>
            <p className="mt-2 text-sm text-gray-500">Loading appointments...</p>
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Calendar className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No appointments for today</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Book a new appointment to see it here.</p>
          </div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Prescription</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">{appointment.time}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-500" />
                          <span className="font-medium">{appointment.patientName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Phone className="h-3 w-3" />
                          <span>{appointment.patientPhone}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{appointment.serviceName}</TableCell>
                    <TableCell>{doctors.find((d) => d.id === appointment.doctor)?.name || "No Doctor"}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-gray-500" />
                          <span>₹{appointment.finalAmount}</span>
                        </div>
                        {appointment.discount > 0 && (
                          <div className="text-xs text-gray-500">
                            (₹{appointment.amount} - ₹{appointment.discount} discount)
                          </div>
                        )}
                        <div className="text-xs">
                          {PaymentOptions.find((p) => p.value === appointment.paymentMethod)?.label ||
                            appointment.paymentMethod}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={appointment.isWalkIn ? "default" : "secondary"}>
                        {appointment.isWalkIn ? "Walk-in" : "On-Call"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {appointment.prescriptionUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => viewPrescription(appointment.prescriptionUrl!)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleWritePrescription(appointment)}
                          className="text-emerald-600 hover:text-emerald-800"
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          Write
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </CardContent>
  )
}

export default TodayAppointments
