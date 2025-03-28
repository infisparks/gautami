"use client";

import React, { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import { format, parseISO } from "date-fns";
import { useRouter } from "next/navigation";

// ===== Interfaces =====
interface ServiceItem {
  serviceName: string;
  doctorName?: string;
  type: "service" | "doctorvisit";
  amount: number;
  createdAt?: string;
}

interface Payment {
  id?: string;
  amount: number;
  paymentType: string;
  date: string;
}

interface BillingRecord {
  patientId: string;
  ipdId: string;
  name: string;
  mobileNumber: string;
  address?: string;
  age?: string | number;
  gender?: string;
  relativeName?: string;
  relativePhone?: string;
  relativeAddress?: string;
  dischargeDate?: string;
  amount: number;
  paymentType: string;
  roomType?: string;
  bed?: string;
  services: ServiceItem[];
  payments: Payment[];
  discount?: number;
}

export default function PatientsPage() {
  const [allRecords, setAllRecords] = useState<BillingRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<BillingRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState<"non-discharge" | "discharge">("non-discharge");
  const router = useRouter();

  // ===== Fetch Patients Data =====
  useEffect(() => {
    const patientsRef = ref(db, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setAllRecords([]);
        setFilteredRecords([]);
        return;
      }
      const data = snapshot.val();
      const ipdRecords: BillingRecord[] = [];

      Object.keys(data).forEach((patientId) => {
        const patientNode = data[patientId];
        const patientName = patientNode.name || "Unknown";
        const phone = patientNode.phone || "";
        const patientAddress = patientNode.address || "";
        const patientAge = patientNode.age || "";
        const patientGender = patientNode.gender || "";

        if (patientNode.ipd) {
          Object.keys(patientNode.ipd).forEach((ipdId) => {
            const ipd = patientNode.ipd[ipdId];

            const servicesArray: ServiceItem[] = ipd.services
              ? ipd.services.map((svc: any) => ({
                  serviceName: svc.serviceName || "",
                  doctorName: svc.doctorName || "",
                  type: svc.type || "service",
                  amount: Number(svc.amount) || 0,
                  createdAt: svc.createdAt || "",
                }))
              : [];

            let paymentsArray: Payment[] = [];
            if (ipd.payments) {
              paymentsArray = Object.keys(ipd.payments).map((k) => ({
                id: k,
                amount: Number(ipd.payments[k].amount) || 0,
                paymentType: ipd.payments[k].paymentType || "cash",
                date: ipd.payments[k].date || new Date().toISOString(),
              }));
            }

            const record: BillingRecord = {
              patientId,
              ipdId,
              name: patientName,
              mobileNumber: phone,
              address: patientAddress,
              age: patientAge,
              gender: patientGender,
              relativeName: ipd.relativeName || "",
              relativePhone: ipd.relativePhone || "",
              relativeAddress: ipd.relativeAddress || "",
              amount: Number(ipd.amount || 0),
              paymentType: ipd.paymentType || "deposit",
              roomType: ipd.roomType || "",
              bed: ipd.bed || "",
              services: servicesArray,
              payments: paymentsArray,
              dischargeDate: ipd.dischargeDate,
              discount: ipd.discount ? Number(ipd.discount) : 0,
            };

            ipdRecords.push(record);
          });
        }
      });

      setAllRecords(ipdRecords);
    });

    return () => unsubscribe();
  }, []);

  // ===== Filter Records by Tab and Search Term =====
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    let records = [...allRecords];

    // Apply tab filter: "non-discharge" shows only records without a dischargeDate, "discharge" shows those with a dischargeDate.
    if (selectedTab === "non-discharge") {
      records = records.filter((rec) => !rec.dischargeDate);
    } else if (selectedTab === "discharge") {
      records = records.filter((rec) => rec.dischargeDate);
    }

    // Apply search filter if a term is entered.
    if (term) {
      records = records.filter(
        (rec) =>
          rec.ipdId.toLowerCase().includes(term) ||
          rec.name.toLowerCase().includes(term) ||
          rec.mobileNumber.toLowerCase().includes(term)
      );
    }

    setFilteredRecords(records);
  }, [allRecords, searchTerm, selectedTab]);

  // ===== Sorting by Date =====
  const getRecordDate = (record: BillingRecord): Date => {
    if (record.dischargeDate) {
      return new Date(record.dischargeDate);
    } else if (record.services.length > 0 && record.services[0].createdAt) {
      return new Date(record.services[0].createdAt);
    } else {
      return new Date(0);
    }
  };

  const sortedRecords = [...filteredRecords].sort(
    (a, b) => getRecordDate(b).getTime() - getRecordDate(a).getTime()
  );

  // ===== Handle Record Selection =====
  const handleSelectRecord = (record: BillingRecord) => {
    // Navigate to billing management page with patientId and ipdId as route params
    router.push(`/billing/${record.patientId}/${record.ipdId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <h1 className="text-4xl font-bold text-indigo-800 mb-8 text-center">
        IPD Billing Management - Select Patient
      </h1>
      
      {/* Tabs for filtering by discharge status */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex shadow rounded-lg" role="tablist">
          <button
            onClick={() => setSelectedTab("non-discharge")}
            className={`px-4 py-2 rounded-l-lg focus:outline-none transition-colors duration-300 ${
              selectedTab === "non-discharge"
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            Non Discharged
          </button>
          <button
            onClick={() => setSelectedTab("discharge")}
            className={`px-4 py-2 rounded-r-lg focus:outline-none transition-colors duration-300 ${
              selectedTab === "discharge"
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            Discharged
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-8 flex justify-center">
        <div className="flex items-center bg-gray-100 rounded-full p-2 w-full max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Name, IPD ID, or Mobile"
            className="flex-grow bg-transparent px-4 py-2 focus:outline-none"
          />
        </div>
      </div>
      
      {/* Table Container */}
      {sortedRecords.length === 0 ? (
        <p className="text-gray-500 text-center">No records found.</p>
      ) : (
        <div className="overflow-x-auto bg-white shadow rounded-lg">
          <table className="min-w-full">
            <thead>
              <tr className="bg-indigo-100">
                <th className="px-4 py-2 text-left">Rank</th>
                <th className="px-4 py-2 text-left">Patient Name</th>
                <th className="px-4 py-2 text-left">Mobile Number</th>
                <th className="px-4 py-2 text-left">Total Deposit (Rs)</th>
                <th className="px-4 py-2 text-left">Payment Type</th>
                <th className="px-4 py-2 text-left">Discharge Date</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.map((rec, index) => (
                <tr
                  key={`${rec.patientId}-${rec.ipdId}`}
                  className="hover:bg-indigo-50 cursor-pointer transition duration-150"
                  onClick={() => handleSelectRecord(rec)}
                >
                  <td className="border-t px-4 py-2">{index + 1}</td>
                  <td className="border-t px-4 py-2">{rec.name}</td>
                  <td className="border-t px-4 py-2">{rec.mobileNumber}</td>
                  <td className="border-t px-4 py-2">
                    {rec.amount.toLocaleString()}
                  </td>
                  <td className="border-t px-4 py-2 capitalize">
                    {rec.paymentType}
                  </td>
                  <td className="border-t px-4 py-2">
                    {rec.dischargeDate
                      ? format(parseISO(rec.dischargeDate), "dd MMM yyyy")
                      : "Not discharged"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
