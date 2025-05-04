"use client"

import type React from "react"
import { useState } from "react"
import Head from "next/head"
import { HelpCircle } from "lucide-react"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import "react-datepicker/dist/react-datepicker.css"
import Joyride, { type CallBackProps, STATUS } from "react-joyride"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import AppointmentForm from "./components/appointment-form"
import OnCallPatients from "./components/on-call-patients"
import TodayAppointments from "./components/today-appointments"
import type { OnCallPatient as OnCallPatientType } from "./types/opd-types"

/** ---------------------------
 *   TYPE & CONSTANT DEFINITIONS
 *  ---------------------------
 */
interface IFormInput {
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

interface PatientRecord {
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
interface MedfordPatient {
  patientId: string
  name: string
  contact: string
  dob: string
  gender: string
  hospitalName: string
}

// Combined patient type for auto‑suggestions
interface CombinedPatient {
  id: string
  name: string
  phone?: string
  source: "gautami" | "other"
  data: PatientRecord | MedfordPatient
}

interface Doctor {
  id: string
  name: string
  opdCharge: number
  specialty?: string
}

interface OnCallPatient {
  id: string
  name: string
  phone: string
  age?: number
  gender?: string
  message?: string
  createdAt: string
}

const PaymentOptions = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
]

const GenderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
]

/**
 * Utility function: Format a Date to 12‑hour time with AM/PM
 */
function formatAMPM(date: Date): string {
  let hours = date.getHours()
  let minutes: string | number = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12 // the hour '0' should be '12'
  minutes = minutes < 10 ? "0" + minutes : minutes
  return `${hours}:${minutes} ${ampm}`
}

/** Helper function to generate a 10‑character alphanumeric UHID */
function generatePatientId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/** ---------------
 *    MAIN COMPONENT
 *  ---------------
 */
const OPDBookingPage: React.FC = () => {
  // States for UI control
  const [mainTab, setMainTab] = useState("appointment")

  // States for Joyride (guided tour)
  const [runTour, setRunTour] = useState(false)
  const tourSteps = [
    {
      target: '[data-tour="patient-name"]',
      content: "Enter the patient name here or search for existing patients.",
      disableBeacon: true,
    },
    {
      target: '[data-tour="phone"]',
      content: "Enter a valid 10-digit phone number here. You can also search by number.",
    },
    {
      target: '[data-tour="age"]',
      content: "Specify the patient's age.",
    },
    {
      target: '[data-tour="gender"]',
      content: "Select the patient's gender.",
    },
    {
      target: '[data-tour="address"]',
      content: "Fill in the address (optional).",
    },
    {
      target: '[data-tour="appointment-type"]',
      content: "Select whether this is a walk-in appointment or an on-call appointment.",
    },
    {
      target: '[data-tour="date"]',
      content: "Choose the appointment date.",
    },
    {
      target: '[data-tour="time"]',
      content: "Enter the appointment time.",
    },
    {
      target: '[data-tour="message"]',
      content: "Add any additional message or note here (optional).",
    },
    {
      target: '[data-tour="paymentMethod"]',
      content: "Select the payment method.",
    },
    {
      target: '[data-tour="serviceName"]',
      content: "Enter the service name for the appointment.",
    },
    {
      target: '[data-tour="doctor"]',
      content: 'Select the doctor or choose "No Doctor".',
    },
    {
      target: '[data-tour="amount"]',
      content: "The amount will be auto‑filled based on the doctor charge. Adjust if needed.",
    },
    {
      target: '[data-tour="discount"]',
      content: "Enter any discount amount to be applied to the total.",
    },
  ]

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRunTour(false)
    }
  }

  /** -------------
   *   START TOUR
   *  -------------
   */
  const startTour = () => {
    setRunTour(true)
  }

  /** -----------------------------
   *   CONVERT ON-CALL TO APPOINTMENT
   *  -----------------------------
   */
  const convertOnCallToAppointment = (patient: OnCallPatientType) => {
    // Switch to appointment tab
    setMainTab("appointment")
  }

  /** -----------------------------
   *   NEW ON-CALL REGISTRATION
   *  -----------------------------
   */
  const handleNewOnCallRegistration = () => {
    setMainTab("appointment")
  }

  /** -----------
   *   RENDER UI
   *  -----------
   */
  return (
    <>
      <Head>
        <title>OPD Booking System</title>
        <meta name="description" content="Book your OPD appointment easily" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ToastContainer position="top-right" autoClose={3000} />

      {/* Joyride Component for Guided Tour */}
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        showSkipButton
        showProgress
        callback={handleJoyrideCallback}
        styles={{
          options: { zIndex: 10000, primaryColor: "#10b981" },
        }}
      />

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <Card className="w-full max-w-4xl mx-auto shadow-lg">
            <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-2xl md:text-3xl font-bold">OPD Booking System</CardTitle>
                  <CardDescription className="text-emerald-100">
                    Book appointments quickly and efficiently
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startTour}
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                >
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Help
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* Main Tabs: Appointment vs On-Call Patients vs Today's Appointments */}
              <Tabs defaultValue="appointment" value={mainTab} onValueChange={setMainTab} className="w-full">
                <TabsList className="w-full grid grid-cols-3 rounded-none">
                  <TabsTrigger value="appointment" className="text-sm md:text-base">
                    Appointment Booking
                  </TabsTrigger>
                  <TabsTrigger value="onCallPatients" className="text-sm md:text-base">
                    On-Call Patients
                  </TabsTrigger>
                  <TabsTrigger value="todayAppointments" className="text-sm md:text-base">
                    Today's Appointments
                  </TabsTrigger>
                </TabsList>

                {/* Appointment Booking Tab */}
                <TabsContent value="appointment">
                  <AppointmentForm onStartTour={startTour} />
                </TabsContent>

                {/* On-Call Patients Tab */}
                <TabsContent value="onCallPatients">
                  <OnCallPatients
                    onConvertToAppointment={convertOnCallToAppointment}
                    onNewOnCallRegistration={handleNewOnCallRegistration}
                  />
                </TabsContent>

                {/* Today's Appointments Tab */}
                <TabsContent value="todayAppointments">
                  <TodayAppointments />
                </TabsContent>
              </Tabs>
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row justify-between items-center p-6 bg-gray-50 dark:bg-gray-900 border-t">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-0">
                Fields marked with <span className="text-red-500">*</span> are required
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={startTour}>
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Tour
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </>
  )
}

export default OPDBookingPage
