"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef } from "react"
import { useForm, Controller } from "react-hook-form"
import { db } from "../lib/firebase"
import { db as dbMedford } from "../lib/firebaseMedford"
import { ref, push, update, get, onValue, set } from "firebase/database"
import {
  Phone,
  Cake,
  MapPin,
  Clock,
  MessageSquare,
  DollarSign,
  Info,
  CheckCircle,
  Percent,
} from "lucide-react"
import { toast } from "react-toastify"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  type IFormInput,
  type CombinedPatient,
  type Doctor,
  GenderOptions,
  PaymentOptions,
  formatAMPM,
  generatePatientId,
} from "../types/opd-types"
import { PersonIcon, CalendarIcon } from "@radix-ui/react-icons"

interface AppointmentFormProps {
  onStartTour: () => void
}

const AppointmentForm: React.FC<AppointmentFormProps> = ({ onStartTour }) => {
  // Form state using React Hook Form
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isValid },
    reset,
    watch,
    setValue,
    getValues,
  } = useForm<IFormInput>({
    defaultValues: {
      name: "",
      phone: "",
      age: 0,
      gender: "",
      address: "",
      date: new Date(),
      time: formatAMPM(new Date()),
      message: "",
      paymentMethod: "",
      amount: 0,
      serviceName: "",
      doctor: "",
      discount: 0,
      isWalkIn: true,
      isOnCall: false,
    },
    mode: "onChange",
  })

  // States for UI control
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [amountAfterDiscount, setAmountAfterDiscount] = useState<number>(0)

  // States for patient management
  const [patientNameInput, setPatientNameInput] = useState("")
  const [patientSuggestions, setPatientSuggestions] = useState<CombinedPatient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<CombinedPatient | null>(null)
  const [patientPhoneInput, setPatientPhoneInput] = useState("")
  const [phoneSuggestions, setPhoneSuggestions] = useState<CombinedPatient[]>([])
  const [gautamiPatients, setGautamiPatients] = useState<CombinedPatient[]>([])
  const [medfordPatients, setMedfordPatients] = useState<CombinedPatient[]>([])

  // Refs
  const phoneSuggestionBoxRef = useRef<HTMLDivElement>(null)

  // Watch for changes in amount and discount to calculate amount after discount
  const amount = watch("amount")
  const discount = watch("discount")
  const isOnCall = watch("isOnCall")

  useEffect(() => {
    const discountValue = discount || 0
    const amountValue = amount || 0
    const calculatedAmount = Math.max(0, amountValue - discountValue)
    setAmountAfterDiscount(calculatedAmount)
  }, [amount, discount])

  /** ----------------
   *   FETCH DOCTORS
   *  ----------------
   */
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
        // Add "No Doctor" option
        doctorsList.unshift({ id: "no_doctor", name: "No Doctor", opdCharge: 0 })
        setDoctors(doctorsList)
      } else {
        setDoctors([{ id: "no_doctor", name: "No Doctor", opdCharge: 0 }])
      }
    })
    return () => unsubscribe()
  }, [])

  /** -------------------------------
   *  FETCH PATIENTS FROM BOTH DATABASES
   *  -------------------------------
   */
  // Fetch patients from Gautami DB
  useEffect(() => {
    const patientsRef = ref(db, "patients")
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      const data = snapshot.val()
      const loaded: CombinedPatient[] = []
      if (data) {
        for (const key in data) {
          loaded.push({
            id: key,
            name: data[key].name,
            phone: data[key].phone,
            source: "gautami",
            data: { ...data[key], id: key },
          })
        }
      }
      setGautamiPatients(loaded)
    })
    return () => unsubscribe()
  }, [])

  // Fetch patients from Medford Family DB
  useEffect(() => {
    const medfordRef = ref(dbMedford, "patients")
    const unsubscribe = onValue(medfordRef, (snapshot) => {
      const data = snapshot.val()
      const loaded: CombinedPatient[] = []
      if (data) {
        for (const key in data) {
          const rec = data[key]
          loaded.push({
            id: rec.patientId,
            name: rec.name,
            phone: rec.contact,
            source: "other",
            data: rec,
          })
        }
      }
      setMedfordPatients(loaded)
    })
    return () => unsubscribe()
  }, [])

  // Combined suggestions for the name field are updated when patientNameInput changes.
  useEffect(() => {
    const allCombined = [...gautamiPatients, ...medfordPatients]
    if (patientNameInput.length >= 2) {
      if (selectedPatient && patientNameInput === selectedPatient.name) {
        setPatientSuggestions([])
      } else {
        const lower = patientNameInput.toLowerCase()
        const suggestions = allCombined.filter((p) => p.name.toLowerCase().includes(lower))
        setPatientSuggestions(suggestions)
      }
    } else {
      setPatientSuggestions([])
    }
  }, [patientNameInput, gautamiPatients, medfordPatients, selectedPatient])

  /** -------------------------------------------
   *  SELECT PATIENT FROM DROPDOWN, AUTO-FILL FORM
   *  -------------------------------------------
   */
  const handlePatientSuggestionClick = (patient: CombinedPatient) => {
    setSelectedPatient(patient)
    setValue("name", patient.name)
    setValue("phone", patient.phone || "")
    setPatientNameInput(patient.name)
    setPatientPhoneInput(patient.phone || "")
    if (patient.source === "gautami") {
      setValue("address", (patient.data as any).address)
      setValue("age", (patient.data as any).age || 0)
      setValue("gender", (patient.data as any).gender || "")
    } else {
      setValue("gender", (patient.data as any).gender || "")
    }
    setPatientSuggestions([])
    setPhoneSuggestions([])
    toast.info(`Patient ${patient.name} selected from ${patient.source.toUpperCase()}!`)
  }

  /** -----------------------------------------
   *  FETCH DOCTOR AMOUNT WHEN DOCTOR CHANGES
   *  -----------------------------------------
   */
  const selectedDoctorId = watch("doctor")
  const fetchDoctorAmount = useCallback(
    async (doctorId: string) => {
      try {
        const doctorRef = ref(db, `doctors/${doctorId}`)
        const snapshot = await get(doctorRef)
        if (snapshot.exists()) {
          const data = snapshot.val()
          setValue("amount", data.opdCharge || 0)
        } else {
          setValue("amount", 0)
        }
      } catch (error) {
        console.error("Error fetching doctor amount:", error)
        setValue("amount", 0)
      }
    },
    [setValue],
  )

  useEffect(() => {
    if (selectedDoctorId) {
      if (selectedDoctorId === "no_doctor") {
        setValue("amount", 0)
      } else {
        fetchDoctorAmount(selectedDoctorId)
      }
    } else {
      setValue("amount", 0)
    }
  }, [selectedDoctorId, setValue, fetchDoctorAmount])

  /**
   * ----------------------------------------------------------------------
   *  SUBMISSION LOGIC:
   *   1. If an existing patient is selected, push OPD data.
   *   2. Otherwise, create a new patient record in Gautami DB (full details)
   *      and a minimal record in Medford DB, then push OPD data.
   *   3. After DB writes, send a professional WhatsApp message to the patient.
   * ----------------------------------------------------------------------
   */
  const onSubmit = async (data: IFormInput) => {
    setLoading(true)
    try {
      // If it's an on-call appointment, save to onCallPatients node
      if (data.isOnCall) {
        const onCallData = {
          name: data.name,
          phone: data.phone,
          age: data.age,
          gender: data.gender,
          message: data.message || "",
          serviceName: data.serviceName,
          doctor: data.doctor,
          createdAt: new Date().toISOString(),
        }

        const onCallRef = ref(db, "onCallPatients")
        const newOnCallRef = push(onCallRef)
        await set(newOnCallRef, onCallData)

        toast.success("On-call patient registered successfully!", {
          position: "top-right",
          autoClose: 5000,
        })

        reset({
          name: "",
          phone: "",
          age: 0,
          gender: "",
          address: "",
          date: new Date(),
          time: formatAMPM(new Date()),
          message: "",
          paymentMethod: "",
          amount: 0,
          serviceName: "",
          doctor: "",
          discount: 0,
          isWalkIn: true,
          isOnCall: false,
        })
        setSelectedPatient(null)
        setPatientNameInput("")
        setPatientPhoneInput("")
        return
      }

      // For regular appointments
      const appointmentData = {
        date: data.date.toISOString(),
        time: data.time,
        paymentMethod: data.paymentMethod,
        amount: data.amount,
        discount: data.discount || 0,
        finalAmount: amountAfterDiscount,
        serviceName: data.serviceName,
        doctor: data.doctor || "no_doctor",
        message: data.message || "",
        isWalkIn: data.isWalkIn,
        createdAt: new Date().toISOString(),
      }

      let patientId = ""
      if (selectedPatient) {
        // Existing patient: update basic info
        patientId = selectedPatient.id
        const patientRef = ref(db, `patients/${patientId}`)
        await update(patientRef, {
          name: data.name,
          phone: data.phone,
          age: data.age,
          address: data.address,
          gender: data.gender,
        })
      } else {
        // New patient: create fresh record in both DBs
        const newPatientId = generatePatientId()
        const newPatientData = {
          name: data.name,
          phone: data.phone,
          age: data.age,
          gender: data.gender,
          address: data.address || "",
          createdAt: new Date().toISOString(),
          uhid: newPatientId,
        }
        await set(ref(db, `patients/${newPatientId}`), newPatientData)
        await set(ref(dbMedford, `patients/${newPatientId}`), {
          name: data.name,
          contact: data.phone,
          gender: data.gender,
          dob: "",
          patientId: newPatientId,
          hospitalName: "MEDFORD",
        })
        patientId = newPatientId
      }

      // Push OPD appointment under the patient node
      const opdRef = ref(db, `patients/${patientId}/opd`)
      const newOpdRef = push(opdRef)
      await update(newOpdRef, appointmentData)

      // ----------------------
      // Send WhatsApp message
      // ----------------------
      try {
        const selectedDocName = doctors.find((doc) => doc.id === data.doctor)?.name || "No Doctor"
        const formattedDate = data.date.toLocaleDateString("en-IN") // e.g. DD/MM/YYYY
        const professionalMessage = `Hello ${data.name}, 
Your OPD appointment at Gautami Hospital has been successfully booked.

Appointment Details:
• Patient Name: ${data.name}
• Date: ${formattedDate}
• Time: ${data.time}
• Doctor: ${selectedDocName}
• Service: ${data.serviceName}
• Payment: ${data.paymentMethod.toUpperCase()} (₹${amountAfterDiscount})

We look forward to serving you!
Thank you,
Gautami Hospital
`

        // IMPORTANT: If your phone numbers do not already have country codes,
        // you may need to prepend "91" or the correct country code here.
        const phoneWithCountryCode = `91${data.phone.replace(/\D/g, "")}`

        await fetch("https://wa.medblisss.com/send-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "99583991572",
            number: phoneWithCountryCode,
            message: professionalMessage,
          }),
        })
      } catch (whatsappError) {
        console.error("Error sending WhatsApp message:", whatsappError)
        // We won't fail the entire booking for a WhatsApp error; just log it.
      }

      toast.success("Appointment booked successfully!", {
        position: "top-right",
        autoClose: 5000,
      })

      // Reset the form and state
      reset({
        name: "",
        phone: "",
        age: 0,
        gender: "",
        address: "",
        date: new Date(),
        time: formatAMPM(new Date()),
        message: "",
        paymentMethod: "",
        amount: 0,
        serviceName: "",
        doctor: "",
        discount: 0,
        isWalkIn: true,
        isOnCall: false,
      })
      setPreviewOpen(false)
      setSelectedPatient(null)
      setPatientNameInput("")
      setPatientPhoneInput("")
    } catch (error) {
      console.error("Error booking appointment:", error)
      toast.error("Failed to book appointment. Please try again.", {
        position: "top-right",
        autoClose: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <CardContent className="p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Patient Name Field with Auto-Suggest */}
          <div className="space-y-2" data-tour="patient-name">
            <Label htmlFor="name" className="text-sm font-medium">
              Patient Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <PersonIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="name"
                type="text"
                value={patientNameInput}
                onChange={(e) => {
                  setPatientNameInput(e.target.value)
                  setValue("name", e.target.value, {
                    shouldValidate: true,
                  })
                  setSelectedPatient(null)
                }}
                placeholder="Enter patient name"
                className="pl-10"
              />
              {patientSuggestions.length > 0 && !selectedPatient && (
                <ScrollArea className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md w-full mt-1 max-h-48 shadow-lg">
                  <div className="p-1">
                    {patientSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="flex items-center justify-between px-3 py-2 hover:bg-emerald-50 dark:hover:bg-gray-700 rounded-md cursor-pointer"
                        onClick={() => handlePatientSuggestionClick(suggestion)}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                              {suggestion.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{suggestion.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">{suggestion.phone || "No phone"}</span>
                          <Badge
                            variant={suggestion.source === "gautami" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {suggestion.source}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
            {errors.name && <p className="text-sm text-red-500">{errors.name.message || "Name is required"}</p>}
          </div>

          {/* Phone Field with Auto-Suggest */}
          <div className="space-y-2" data-tour="phone">
            <Label htmlFor="phone" className="text-sm font-medium">
              Phone Number <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="phone"
                type="tel"
                value={patientPhoneInput}
                onChange={(e) => {
                  const val = e.target.value
                  setPatientPhoneInput(val)
                  setValue("phone", val, { shouldValidate: true })
                  if (val.trim().length >= 2) {
                    const suggestions = [...gautamiPatients, ...medfordPatients].filter(
                      (p) => p.phone && p.phone.includes(val.trim()),
                    )
                    setPhoneSuggestions(suggestions)
                  } else {
                    setPhoneSuggestions([])
                  }
                }}
                placeholder="Enter 10-digit number"
                className="pl-10"
              />
              {phoneSuggestions.length > 0 && (
                <div
                  ref={phoneSuggestionBoxRef}
                  className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md w-full mt-1 max-h-48 overflow-auto shadow-lg"
                >
                  {phoneSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      onClick={() => handlePatientSuggestionClick(suggestion)}
                      className="flex items-center justify-between px-3 py-2 hover:bg-emerald-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">
                            {suggestion.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{suggestion.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">{suggestion.phone || "No phone"}</span>
                        <Badge variant={suggestion.source === "gautami" ? "default" : "secondary"} className="text-xs">
                          {suggestion.source}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errors.phone && (
              <p className="text-sm text-red-500">{errors.phone.message || "Phone number is required"}</p>
            )}
          </div>

          {/* Age Field */}
          <div className="space-y-2" data-tour="age">
            <Label htmlFor="age" className="text-sm font-medium">
              Age <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Cake className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="age"
                type="number"
                {...register("age", {
                  required: "Age is required",
                  min: { value: 1, message: "Age must be positive" },
                })}
                placeholder="Enter age"
                className="pl-10"
              />
            </div>
            {errors.age && <p className="text-sm text-red-500">{errors.age.message}</p>}
          </div>

          {/* Gender Field */}
          <div className="space-y-2" data-tour="gender">
            <Label htmlFor="gender" className="text-sm font-medium">
              Gender <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="gender"
              rules={{ required: "Gender is required" }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {GenderOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.gender && <p className="text-sm text-red-500">{errors.gender.message}</p>}
          </div>

          {/* Address Field */}
          <div className="space-y-2" data-tour="address">
            <Label htmlFor="address" className="text-sm font-medium">
              Address
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <Textarea
                id="address"
                {...register("address")}
                placeholder="Enter address (optional)"
                className="pl-10 min-h-[80px]"
              />
            </div>
          </div>

          {/* Appointment Type */}
          <div className="space-y-2" data-tour="appointment-type">
            <Label className="text-sm font-medium">
              Appointment Type <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="walk-in"
                  checked={watch("isWalkIn")}
                  onCheckedChange={(checked) => {
                    setValue("isWalkIn", checked === true)
                    if (checked) {
                      setValue("isOnCall", false)
                    }
                  }}
                />
                <Label htmlFor="walk-in" className="text-sm cursor-pointer">
                  Walk-in
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="on-call"
                  checked={watch("isOnCall")}
                  onCheckedChange={(checked) => {
                    setValue("isOnCall", checked === true)
                    if (checked) {
                      setValue("isWalkIn", false)
                    }
                  }}
                />
                <Label htmlFor="on-call" className="text-sm cursor-pointer">
                  On Call
                </Label>
              </div>
            </div>
          </div>

          {/* Date Field */}
          <div className="space-y-2" data-tour="date">
            <Label htmlFor="date" className="text-sm font-medium">
              Appointment Date <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Controller
                control={control}
                name="date"
                rules={{ required: "Date is required" }}
                render={({ field }) => (
                  <DatePicker
                    selected={field.value}
                    onChange={(date: Date | null) => date && field.onChange(date)}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="Select Date"
                    className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                  />
                )}
              />
            </div>
            {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
          </div>

          {/* Time Field */}
          <div className="space-y-2" data-tour="time">
            <Label htmlFor="time" className="text-sm font-medium">
              Appointment Time <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="time"
                type="text"
                {...register("time", {
                  required: "Time is required",
                })}
                placeholder="e.g. 10:30 AM"
                className="pl-10"
                defaultValue={formatAMPM(new Date())}
              />
            </div>
            {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
          </div>

          {/* Payment Method Field - Only show if not on call */}
          {!isOnCall && (
            <div className="space-y-2" data-tour="paymentMethod">
              <Label htmlFor="paymentMethod" className="text-sm font-medium">
                Payment Method <span className="text-red-500">*</span>
              </Label>
              <Controller
                control={control}
                name="paymentMethod"
                rules={{ required: "Payment method is required" }}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {PaymentOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.paymentMethod && <p className="text-sm text-red-500">{errors.paymentMethod.message}</p>}
            </div>
          )}

          {/* Service Name Field */}
          <div className="space-y-2" data-tour="serviceName">
            <Label htmlFor="serviceName" className="text-sm font-medium">
              Service Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Info className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                id="serviceName"
                type="text"
                {...register("serviceName", {
                  required: "Service name is required",
                })}
                placeholder="Enter service name"
                className="pl-10"
              />
            </div>
            {errors.serviceName && <p className="text-sm text-red-500">{errors.serviceName.message}</p>}
          </div>

          {/* Doctor Selection Field */}
          <div className="space-y-2" data-tour="doctor">
            <Label htmlFor="doctor" className="text-sm font-medium">
              Doctor <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="doctor"
              rules={{ required: "Doctor selection is required" }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        {doctor.name} {doctor.specialty ? `(${doctor.specialty})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.doctor && <p className="text-sm text-red-500">{errors.doctor.message}</p>}
          </div>

          {/* Amount Field - Only show if not on call */}
          {!isOnCall && (
            <div className="space-y-2" data-tour="amount">
              <Label htmlFor="amount" className="text-sm font-medium">
                Amount (Rs) <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="amount"
                  type="number"
                  {...register("amount", {
                    required: "Amount is required",
                    min: { value: 0, message: "Amount must be positive" },
                  })}
                  placeholder="Enter amount"
                  className="pl-10"
                />
              </div>
              {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
            </div>
          )}

          {/* Discount Field - Only show if not on call */}
          {!isOnCall && (
            <div className="space-y-2" data-tour="discount">
              <Label htmlFor="discount" className="text-sm font-medium">
                Discount (Rs)
              </Label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="discount"
                  type="number"
                  {...register("discount", {
                    min: { value: 0, message: "Discount must be positive" },
                  })}
                  placeholder="Enter discount amount"
                  className="pl-10"
                />
              </div>
              {errors.discount && <p className="text-sm text-red-500">{errors.discount.message}</p>}
              {amount > 0 && discount > 0 && (
                <div className="text-sm text-emerald-600 font-medium mt-1">
                  Amount after discount: ₹{amountAfterDiscount}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message Field */}
        <div className="space-y-2" data-tour="message">
          <Label htmlFor="message" className="text-sm font-medium">
            Additional Notes
          </Label>
          <div className="relative">
            <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
            <Textarea
              id="message"
              {...register("message")}
              placeholder="Enter any additional notes (optional)"
              className="pl-10 min-h-[100px]"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setPreviewOpen(true)}>
            Preview
          </Button>
          <Button
            type="submit"
            className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            disabled={loading || !isValid}
          >
            {loading ? "Submitting..." : isOnCall ? "Register On-Call" : "Book Appointment"}
          </Button>
        </div>
      </form>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Appointment Preview</DialogTitle>
            <DialogDescription>Review your appointment details before submitting</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="font-medium">Patient Name:</div>
              <div>{watch("name")}</div>

              <div className="font-medium">Phone:</div>
              <div>{watch("phone")}</div>

              <div className="font-medium">Age:</div>
              <div>{watch("age")}</div>

              <div className="font-medium">Gender:</div>
              <div>{GenderOptions.find((g) => g.value === watch("gender"))?.label || watch("gender")}</div>

              {watch("address") && (
                <>
                  <div className="font-medium">Address:</div>
                  <div>{watch("address")}</div>
                </>
              )}

              <div className="font-medium">Appointment Type:</div>
              <div>{watch("isOnCall") ? "On-Call" : "Walk-in"}</div>

              <div className="font-medium">Date:</div>
              <div>{watch("date")?.toLocaleDateString()}</div>

              <div className="font-medium">Time:</div>
              <div>{watch("time")}</div>

              <div className="font-medium">Service:</div>
              <div>{watch("serviceName")}</div>

              <div className="font-medium">Doctor:</div>
              <div>{doctors.find((d) => d.id === watch("doctor"))?.name || "No Doctor"}</div>

              {!watch("isOnCall") && (
                <>
                  <div className="font-medium">Payment Method:</div>
                  <div>
                    {PaymentOptions.find((p) => p.value === watch("paymentMethod"))?.label || watch("paymentMethod")}
                  </div>

                  <div className="font-medium">Amount:</div>
                  <div>₹ {watch("amount")}</div>

                  {watch("discount") > 0 && (
                    <>
                      <div className="font-medium">Discount:</div>
                      <div>₹ {watch("discount")}</div>

                      <div className="font-medium">Final Amount:</div>
                      <div>₹ {amountAfterDiscount}</div>
                    </>
                  )}
                </>
              )}

              {watch("message") && (
                <>
                  <div className="font-medium">Notes:</div>
                  <div>{watch("message")}</div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? "Processing..." : "Confirm & Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedPatient && (
        <div className="px-6 py-3 mt-4 bg-emerald-50 dark:bg-gray-800 border border-emerald-100 dark:border-gray-700 rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium">
                Patient selected: <span className="text-emerald-600 dark:text-emerald-400">{selectedPatient.name}</span>
              </span>
            </div>
            <Badge variant={selectedPatient.source === "gautami" ? "default" : "secondary"}>
              {selectedPatient.source.toUpperCase()}
            </Badge>
          </div>
        </div>
      )}
    </CardContent>
  )
}

export default AppointmentForm
