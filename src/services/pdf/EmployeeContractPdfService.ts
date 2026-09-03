'use client';

/**
 * Service for generating employee contract PDFs
 * Uses browser print functionality for PDF generation
 */

export interface EmployeeContractData {
  // Personal Info
  name: string;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  fatherName: string;
  
  // Employment Info
  employeeId: string;
  department: string;
  designation: string;
  joinDate: string;
  employmentType: string;
  workLocation: string;
  
  // Address
  currentAddress: string;
  currentCity: string;
  currentState: string;
  currentPostalCode: string;
  permanentAddress: string;
  permanentCity: string;
  permanentState: string;
  permanentPostalCode: string;
  
  // Banking
  accountName: string;
  accountNumber: string;
  bankName: string;
  branchName: string;
  ifscCode: string;
  
  // Contract Details
  contractStartDate: string;
  contractEndDate: string;
  salary: string;
  probationPeriod: string;
  
  // Identity
  aadharNumber: string;
  panNumber: string;
}

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '_______________';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
};

const formatCurrency = (amount: string): string => {
  if (!amount) return '_______________';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount));
};

const getProbationText = (months: string): string => {
  if (!months || months === '0') return 'No probation period';
  return `${months} month${Number(months) > 1 ? 's' : ''}`;
};

/**
 * Generate and download employee contract PDF
 */
export function generateEmployeeContractPdf(data: EmployeeContractData): void {
  const companyName = "Jagannath Security Services";
  const companyAddress = "Corporate Office Address, City, State - PIN";
  const currentDate = formatDate(new Date().toISOString().split('T')[0]);
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Employment Contract - ${data.name || 'Employee'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #000; padding: 40px; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 3px double #D71920; padding-bottom: 20px; }
    .company-name { font-size: 24pt; font-weight: bold; color: #D71920; margin-bottom: 5px; }
    .company-address { font-size: 10pt; color: #666; }
    .title { font-size: 18pt; font-weight: bold; text-align: center; margin: 30px 0; text-decoration: underline; }
    .section { margin: 20px 0; }
    .section-title { font-size: 14pt; font-weight: bold; color: #D71920; margin-bottom: 10px; border-bottom: 1px solid #D71920; padding-bottom: 5px; }
    .content { text-align: justify; margin-bottom: 15px; }
    .details-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .details-table td { padding: 8px; border: 1px solid #ddd; }
    .details-table td:first-child { width: 40%; background: #f9f9f9; font-weight: bold; }
    .clause { margin: 10px 0; padding-left: 20px; }
    .clause-number { font-weight: bold; }
    .signature-section { margin-top: 50px; display: flex; justify-content: space-between; }
    .signature-box { width: 45%; }
    .signature-line { border-top: 1px solid #000; margin-top: 60px; padding-top: 5px; }
    .footer { margin-top: 40px; text-align: center; font-size: 10pt; color: #666; border-top: 1px solid #ddd; padding-top: 15px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${companyName}</div>
    <div class="company-address">${companyAddress}</div>
  </div>
  
  <div class="title">EMPLOYMENT CONTRACT</div>
  
  <div class="content">
    <p>This Employment Contract ("Contract") is entered into on <strong>${currentDate}</strong> between:</p>
    <p style="margin: 15px 0;"><strong>${companyName}</strong> (hereinafter referred to as "Employer")</p>
    <p>AND</p>
    <p style="margin: 15px 0;"><strong>${data.name || '_______________'}</strong>, S/o <strong>${data.fatherName || '_______________'}</strong> (hereinafter referred to as "Employee")</p>
  </div>
  
  <div class="section">
    <div class="section-title">1. EMPLOYEE DETAILS</div>
    <table class="details-table">
      <tr><td>Employee Name</td><td>${data.name || '_______________'}</td></tr>
      <tr><td>Employee ID</td><td>${data.employeeId || '_______________'}</td></tr>
      <tr><td>Father's Name</td><td>${data.fatherName || '_______________'}</td></tr>
      <tr><td>Date of Birth</td><td>${formatDate(data.dateOfBirth)}</td></tr>
      <tr><td>Gender</td><td>${data.gender ? data.gender.charAt(0).toUpperCase() + data.gender.slice(1) : '_______________'}</td></tr>
      <tr><td>Contact Number</td><td>${data.phone || '_______________'}</td></tr>
      <tr><td>Email Address</td><td>${data.email || '_______________'}</td></tr>
      <tr><td>Aadhar Number</td><td>${data.aadharNumber || '_______________'}</td></tr>
      <tr><td>PAN Number</td><td>${data.panNumber || '_______________'}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <div class="section-title">2. ADDRESS DETAILS</div>
    <table class="details-table">
      <tr><td>Current Address</td><td>${data.currentAddress || '_______________'}, ${data.currentCity || ''}, ${data.currentState || ''} - ${data.currentPostalCode || ''}</td></tr>
      <tr><td>Permanent Address</td><td>${data.permanentAddress || '_______________'}, ${data.permanentCity || ''}, ${data.permanentState || ''} - ${data.permanentPostalCode || ''}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <div class="section-title">3. EMPLOYMENT TERMS</div>
    <table class="details-table">
      <tr><td>Designation</td><td>${data.designation || '_______________'}</td></tr>
      <tr><td>Department</td><td>${data.department || '_______________'}</td></tr>
      <tr><td>Employment Type</td><td>${data.employmentType || '_______________'}</td></tr>
      <tr><td>Work Location</td><td>${data.workLocation || '_______________'}</td></tr>
      <tr><td>Date of Joining</td><td>${formatDate(data.joinDate)}</td></tr>
      <tr><td>Contract Start Date</td><td>${formatDate(data.contractStartDate)}</td></tr>
      <tr><td>Contract End Date</td><td>${formatDate(data.contractEndDate)}</td></tr>
      <tr><td>Probation Period</td><td>${getProbationText(data.probationPeriod)}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <div class="section-title">4. COMPENSATION</div>
    <table class="details-table">
      <tr><td>Monthly Salary (Gross)</td><td>${formatCurrency(data.salary)}</td></tr>
      <tr><td>Payment Mode</td><td>Bank Transfer</td></tr>
      <tr><td>Payment Cycle</td><td>Monthly (by 7th of following month)</td></tr>
    </table>
  </div>
  
  <div class="section">
    <div class="section-title">5. BANK ACCOUNT DETAILS</div>
    <table class="details-table">
      <tr><td>Account Holder Name</td><td>${data.accountName || '_______________'}</td></tr>
      <tr><td>Account Number</td><td>${data.accountNumber || '_______________'}</td></tr>
      <tr><td>Bank Name</td><td>${data.bankName || '_______________'}</td></tr>
      <tr><td>Branch</td><td>${data.branchName || '_______________'}</td></tr>
      <tr><td>IFSC Code</td><td>${data.ifscCode || '_______________'}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <div class="section-title">6. TERMS AND CONDITIONS</div>
    <div class="clause"><span class="clause-number">6.1</span> The Employee agrees to perform duties as assigned by the Employer with diligence and integrity.</div>
    <div class="clause"><span class="clause-number">6.2</span> The Employee shall maintain confidentiality of all company information during and after employment.</div>
    <div class="clause"><span class="clause-number">6.3</span> Either party may terminate this contract with 30 days written notice or payment in lieu thereof.</div>
    <div class="clause"><span class="clause-number">6.4</span> The Employee shall adhere to all company policies, rules, and regulations.</div>
    <div class="clause"><span class="clause-number">6.5</span> The Employee shall not engage in any activity that conflicts with the interests of the Employer.</div>
    <div class="clause"><span class="clause-number">6.6</span> This contract is subject to the laws of India and any disputes shall be resolved in the jurisdiction of the Employer's registered office.</div>
  </div>
  
  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-line">
        <strong>For ${companyName}</strong><br>
        Authorized Signatory<br>
        Date: ${currentDate}
      </div>
    </div>
    <div class="signature-box">
      <div class="signature-line">
        <strong>Employee Signature</strong><br>
        ${data.name || '_______________'}<br>
        Date: _______________
      </div>
    </div>
  </div>
  
  <div class="footer">
    <p>This is a computer-generated document. Original copy to be signed by both parties.</p>
    <p>Generated on: ${currentDate}</p>
  </div>
</body>
</html>
  `;
  
  // Open print window
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load then trigger print
    printWindow.onload = () => {
      printWindow.print();
    };
  }
}
