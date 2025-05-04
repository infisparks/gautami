"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { db } from "../lib/firebase"
import { ref, onValue, remove } from "firebase/database"
import { PhoneCall, UserCheck, Trash2 } from "lucide-react"
import { toast } from "react-toastify"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type OnCallPatient, GenderOptions } from "../types/opd-types"

interface OnCallPatientsProps {
  onConvertToAppointment: (patient: OnCallPatient) => void
  onNewOnCallRegistration: () => void
}

const OnCallPatients: React.FC<OnCallPatientsProps> = ({ onConvertToAppointment, onNewOnCallRegistration }) => {
  const [onCallPatients, setOnCallPatients] = useState<OnCallPatient[]>([])

  /** ----------------
   *   FETCH ON-CALL PATIENTS
   *  ----------------
   */
  useEffect(() => {
    const onCallRef = ref(db, "onCallPatients")
    const unsubscribe = onValue(onCallRef, (snapshot) => {
      const data = snapshot.val()
      const loaded: OnCallPatient[] = []
      if (data) {
        for (const key in data) {
          loaded.push({
            id: key,
            name: data[key].name,
            phone: data[key].phone,
            age: data[key].age,
            gender: data[key].gender,
            message: data[key].message,
            serviceName: data[key].serviceName,
            doctor: data[key].doctor,
            createdAt: data[key].createdAt,
          })
        }
        // Sort by creation date (newest first)
        loaded.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      }
      setOnCallPatients(loaded)
    })
    return () => unsubscribe()
  }, [])

  /** -----------------------------
   *   DELETE ON-CALL PATIENT
   *  -----------------------------
   */
  const deleteOnCallPatient = async (patientId: string) => {
    try {
      const onCallRef = ref(db, `onCallPatients/${patientId}`)
      await remove(onCallRef)
      toast.success("On-call patient removed successfully")
    } catch (error) {
      console.error("Error removing on-call patient:", error)
      toast.error("Failed to remove on-call patient")
    }
  }

  return (
    <CardContent className="p-6">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">On-Call Patients</h3>
          <Button onClick={onNewOnCallRegistration} className="bg-emerald-600 hover:bg-emerald-700">
            <PhoneCall className="mr-2 h-4 w-4" />
            New On-Call Registration
          </Button>
        </div>

        {onCallPatients.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <PhoneCall className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No on-call patients</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Register a new on-call patient to see them here.
            </p>
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Age/Gender</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {onCallPatients.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell className="font-medium">{patient.name}</TableCell>
                    <TableCell>{patient.phone}</TableCell>
                    <TableCell>
                      {patient.age || "-"} /{" "}
                      {patient.gender
                        ? GenderOptions.find((g) => g.value === patient.gender)?.label || patient.gender
                        : "-"}
                    </TableCell>
                    <TableCell>{patient.serviceName || "-"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{patient.message || "-"}</TableCell>
                    <TableCell>{new Date(patient.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => onConvertToAppointment(patient)}>
                          <UserCheck className="h-4 w-4 mr-1" />
                          Book
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteOnCallPatient(patient.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

export default OnCallPatients
