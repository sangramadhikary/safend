/**
 * Quotation PDF Generation Route
 * Loads the existing quotation.pdf template from /public and overlays
 * dynamic data on pages 1, 8, and 9.
 */

const express = require('express');
const router = express.Router();
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// ── Input validation helpers ──────────────────────────────────────────────────

/**
 * Validates a required non-empty string field.
 * @param {unknown} val
 * @param {string} fieldName  Used in error messages.
 * @param {number} [maxLength=500]
 * @returns {string} Trimmed string value.
 * @throws {Error} If validation fails.
 */
function requireString(val, fieldName, maxLength = 500) {
  if (typeof val !== 'string') {
    throw new Error(`"${fieldName}" must be a string, got ${typeof val}.`);
  }
  const trimmed = val.trim();
  if (trimmed.length === 0) {
    throw new Error(`"${fieldName}" must not be empty.`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`"${fieldName}" must be at most ${maxLength} characters (got ${trimmed.length}).`);
  }
  return trimmed;
}

/**
 * Validates a required positive finite number.
 * @param {unknown} val
 * @param {string} fieldName
 * @param {number} [max=1_000_000_000]
 * @returns {number}
 */
function requirePositiveNumber(val, fieldName, max = 1_000_000_000) {
  const n = Number(val);
  if (!isFinite(n)) {
    throw new Error(`"${fieldName}" must be a finite number, got ${val}.`);
  }
  if (n <= 0) {
    throw new Error(`"${fieldName}" must be a positive number, got ${n}.`);
  }
  if (n > max) {
    throw new Error(`"${fieldName}" must be at most ${max}, got ${n}.`);
  }
  return n;
}

/**
 * Validates a non-negative finite number (allows zero).
 */
function requireNonNegativeNumber(val, fieldName, max = 1_000_000_000) {
  const n = Number(val);
  if (!isFinite(n)) {
    throw new Error(`"${fieldName}" must be a finite number, got ${val}.`);
  }
  if (n < 0) {
    throw new Error(`"${fieldName}" must be >= 0, got ${n}.`);
  }
  if (n > max) {
    throw new Error(`"${fieldName}" must be at most ${max}, got ${n}.`);
  }
  return n;
}

/**
 * Validates the incoming request body for the /download and /preview routes.
 * Returns a normalised, safe copy of the data.
 * Throws an Error with a descriptive message if any field is invalid.
 *
 * @param {unknown} body
 * @returns {{ documentDetails, clientDetails, laborInputs, roles, contractTerms }}
 */
function validateRequestBody(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be a JSON object.');
  }

  const { documentDetails, clientDetails, laborInputs, roles, contractTerms } = body;

  // ── documentDetails ────────────────────────────────────────────────────────
  if (!documentDetails || typeof documentDetails !== 'object') {
    throw new Error('"documentDetails" is required and must be an object.');
  }
  const safeDoc = {
    referenceNumber: requireString(documentDetails.referenceNumber, 'documentDetails.referenceNumber', 100),
    proposalDate:    requireString(documentDetails.proposalDate,    'documentDetails.proposalDate',    50),
  };

  // ── clientDetails ──────────────────────────────────────────────────────────
  if (!clientDetails || typeof clientDetails !== 'object') {
    throw new Error('"clientDetails" is required and must be an object.');
  }
  const safeClient = {
    companyName:        requireString(clientDetails.companyName,        'clientDetails.companyName',        200),
    address:            requireString(clientDetails.address,            'clientDetails.address',            500),
    attentionSalutation:requireString(clientDetails.attentionSalutation,'clientDetails.attentionSalutation', 200),
  };

  // ── laborInputs ────────────────────────────────────────────────────────────
  if (!laborInputs || typeof laborInputs !== 'object') {
    throw new Error('"laborInputs" is required and must be an object.');
  }
  const safeLabor = {
    dutyHours:              requirePositiveNumber(laborInputs.dutyHours,              'laborInputs.dutyHours',              24),
    standardWorkingDays:    requirePositiveNumber(laborInputs.standardWorkingDays,    'laborInputs.standardWorkingDays',    31),
    extraDays:              requireNonNegativeNumber(laborInputs.extraDays,           'laborInputs.extraDays',              31),
    extraHoursPerMonth:     requireNonNegativeNumber(laborInputs.extraHoursPerMonth,  'laborInputs.extraHoursPerMonth',     744),
    epfPercentage:          requireNonNegativeNumber(laborInputs.epfPercentage,       'laborInputs.epfPercentage',          100),
    esicPercentage:         requireNonNegativeNumber(laborInputs.esicPercentage,      'laborInputs.esicPercentage',         100),
    uniformAllowance:       requireNonNegativeNumber(laborInputs.uniformAllowance,    'laborInputs.uniformAllowance'),
    serviceChargePercentage:requireNonNegativeNumber(laborInputs.serviceChargePercentage,'laborInputs.serviceChargePercentage',100),
  };

  // ── roles ──────────────────────────────────────────────────────────────────
  if (!Array.isArray(roles)) {
    throw new Error('"roles" must be an array.');
  }
  if (roles.length === 0) {
    throw new Error('"roles" must contain at least one role.');
  }
  if (roles.length > 10) {
    throw new Error('"roles" must not exceed 10 entries.');
  }
  const safeRoles = roles.map((r, i) => {
    if (!r || typeof r !== 'object') {
      throw new Error(`"roles[${i}]" must be an object.`);
    }
    return {
      designation:  requireString(r.designation,  `roles[${i}].designation`,  200),
      minimumWage:  requirePositiveNumber(r.minimumWage, `roles[${i}].minimumWage`),
    };
  });

  // ── contractTerms ──────────────────────────────────────────────────────────
  if (!contractTerms || typeof contractTerms !== 'object') {
    throw new Error('"contractTerms" is required and must be an object.');
  }
  const safeTerms = {
    proposalValidityDays:   requirePositiveNumber(contractTerms.proposalValidityDays,  'contractTerms.proposalValidityDays',  3650),
    deploymentLeadTimeDays: requirePositiveNumber(contractTerms.deploymentLeadTimeDays,'contractTerms.deploymentLeadTimeDays',365),
    contractDuration:       requireString(contractTerms.contractDuration,              'contractTerms.contractDuration',      100),
    terminationNoticePeriod:requireString(contractTerms.terminationNoticePeriod,       'contractTerms.terminationNoticePeriod',100),
  };

  return {
    documentDetails: safeDoc,
    clientDetails:   safeClient,
    laborInputs:     safeLabor,
    roles:           safeRoles,
    contractTerms:   safeTerms,
  };
}
// ── End input validation ──────────────────────────────────────────────────────

/**
 * Format number in Indian style: 1,23,456
 */
function formatINR(num) {
  const n = Math.round(num);
  const s = n.toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return formatted + ',' + last3;
}

/**
 * Calculate cost breakup for a role.
 * Matches the exact structure in the original PDF page 8.
 */
function calculateBreakdown(minimumWage, laborInputs) {
  const {
    dutyHours,
    standardWorkingDays,
    extraDays,
    extraHoursPerMonth,
    epfPercentage,
    esicPercentage,
    uniformAllowance,
    serviceChargePercentage
  } = laborInputs;

  const wagePerDay = minimumWage;
  const basic = wagePerDay * standardWorkingDays;
  const epf = Math.round(basic * epfPercentage / 100);
  const gross2 = basic + epf;
  const esic = Math.round(gross2 * esicPercentage / 100);
  const extraDaysAmount = wagePerDay * extraDays;
  const uniform = uniformAllowance;
  // Extra hours: wage/8 * extraHoursPerMonth (matches original PDF formula)
  const extraHoursAmount = Math.round((wagePerDay / 8) * extraHoursPerMonth);
  const gross3 = gross2 + esic + extraDaysAmount + uniform + extraHoursAmount;
  const serviceCharge = Math.round(gross3 * serviceChargePercentage / 100);
  const total = gross3 + serviceCharge;

  return { wagePerDay, basic, epf, gross2, esic, extraDaysAmount, uniform, extraHoursAmount, gross3, serviceCharge, total };
}

/**
 * Cover old text with white rectangle, then draw new text.
 * Uses generous width to ensure old text is fully hidden.
 */
function overlayText(page, x, y, width, height, text, font, fontSize, color) {
  page.drawRectangle({
    x: x - 2,
    y: y - 4,
    width: width + 4,
    height: height + 4,
    color: rgb(1, 1, 1),
  });
  page.drawText(String(text), {
    x: x,
    y: y,
    size: fontSize,
    font: font,
    color: color || rgb(0, 0, 0),
  });
}

/**
 * POST /api/quotation/download
 */
router.post('/download', async (req, res) => {
  try {
    console.log('📄 PDF generation request received');

    // ── Validate and sanitise all inputs ─────────────────────────────────────
    let documentDetails, clientDetails, laborInputs, roles, contractTerms;
    try {
      ({ documentDetails, clientDetails, laborInputs, roles, contractTerms } =
        validateRequestBody(req.body));
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }
    // ── End validation ────────────────────────────────────────────────────────

    // Load template PDF
    const templatePath = path.join(__dirname, '../../public/quotation.pdf');
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);

    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    // Calculate breakdowns
    const breakdowns = roles.map(role => calculateBreakdown(role.minimumWage, laborInputs));

    // ═══════════════════════════════════════════════════════════════
    // PAGE 1: Cover Letter
    // ═══════════════════════════════════════════════════════════════
    const page1 = pdfDoc.getPage(0);

    // Reference Number - original "sfnd/183/2026" starts at X=120, Y=644
    // Cover from X=118 to end of line
    overlayText(page1, 118, 644, 80, 14, documentDetails.referenceNumber, font, 12, rgb(0, 0, 0));

    // Date - original "12-05-2026" at X=475, Y=639
    overlayText(page1, 475, 639, 60, 14, documentDetails.proposalDate, font, 12, rgb(0, 0, 0));

    // Company Name - at X=69, Y=571, font size 14
    overlayText(page1, 69, 571, 300, 16, clientDetails.companyName, font, 14, rgb(0, 0, 0));

    // Address line 1 - at X=69, Y=555
    const addressParts = clientDetails.address.split(',').map(s => s.trim());
    const addrLine1 = addressParts.length > 2 
      ? addressParts.slice(0, -1).join(', ')
      : addressParts[0] || '';
    const addrLine2 = addressParts.length > 2 
      ? addressParts[addressParts.length - 1]
      : (addressParts[1] || '');

    overlayText(page1, 69, 555, 300, 16, addrLine1, font, 14, rgb(0, 0, 0));
    // Address line 2 - at X=69, Y=539
    overlayText(page1, 69, 539, 300, 16, addrLine2, font, 14, rgb(0, 0, 0));

    // Kind Attention salutation - "Sir/Mam" part starts after "Kind Attention: " 
    // Full text "Kind Attention: Sir/Mam," is at X=78, Y=492
    // We cover the whole thing and rewrite it
    overlayText(page1, 78, 492, 220, 14, `Kind Attention: ${clientDetails.attentionSalutation},`, font, 12, rgb(0, 0, 0));

    // ═══════════════════════════════════════════════════════════════
    // PAGE 8: Cost Breakup Tables
    // From the extracted text, the number column is around X=480-530
    // ═══════════════════════════════════════════════════════════════
    const page8 = pdfDoc.getPage(7);

    // --- FIRST ROLE (top half) ---
    if (breakdowns[0]) {
      const b = breakdowns[0];
      
      // Title: "COST BREAKUP FOR 12 Hrs. FOR SEMI-SKILLED SECURITY GUARD" at Y=700
      overlayText(page8, 72, 698, 470, 16, 
        `COST BREAKUP FOR ${laborInputs.dutyHours} Hrs. FOR ${roles[0].designation.toUpperCase()}`,
        fontBold, 12, rgb(0, 0, 0));

      // Column header "12 Hrs." at Y=658
      overlayText(page8, 430, 656, 110, 16, `${laborInputs.dutyHours} Hrs.`, fontBold, 12, rgb(0, 0, 0));

      // Values - cover the entire right cell area (from X=430 to edge)
      const vx = 430;
      const vw = 110; // wide enough to cover entire cell

      // Row 1: Minimum wage (Y=634)
      overlayText(page8, vx, 630, vw, 18, formatINR(b.wagePerDay), font, 11, rgb(0, 0, 0));
      
      // Row 2: Basic (Y=603)
      overlayText(page8, vx, 599, vw, 18, formatINR(b.basic), font, 11, rgb(0, 0, 0));
      
      // Row 3: EPF (Y=582)
      overlayText(page8, vx, 578, vw, 18, formatINR(b.epf), font, 11, rgb(0, 0, 0));
      
      // Row 4: Gross 2 (Y=561)
      overlayText(page8, vx, 557, vw, 18, formatINR(b.gross2), font, 11, rgb(0, 0, 0));
      
      // Row 5: ESIC (Y=540)
      overlayText(page8, vx, 536, vw, 18, formatINR(b.esic), font, 11, rgb(0, 0, 0));
      
      // Row 6: Extra days (Y=520)
      overlayText(page8, vx, 516, vw, 18, formatINR(b.extraDaysAmount), font, 11, rgb(0, 0, 0));
      
      // Row 7: Uniform (Y=499)
      overlayText(page8, vx, 495, vw, 18, formatINR(b.uniform), font, 11, rgb(0, 0, 0));
      
      // Row 8: Extra hours (Y=478)
      overlayText(page8, vx, 474, vw, 18, formatINR(b.extraHoursAmount), font, 11, rgb(0, 0, 0));
      
      // Row 9: Gross 3 (Y=456)
      overlayText(page8, vx, 452, vw, 18, formatINR(b.gross3), font, 11, rgb(0, 0, 0));
      
      // Row 10: Service Charges (Y=434)
      overlayText(page8, vx, 430, vw, 18, formatINR(b.serviceCharge), font, 11, rgb(0, 0, 0));
      
      // Total (Y=412)
      overlayText(page8, vx, 408, vw, 18, formatINR(b.total), fontBold, 11, rgb(0, 0, 0));
    }

    // --- SECOND ROLE (bottom half) ---
    if (breakdowns[1]) {
      const b = breakdowns[1];
      
      // Title at Y=378
      overlayText(page8, 72, 376, 470, 16,
        `COST BREAKUP FOR ${laborInputs.dutyHours} Hrs. FOR ${roles[1].designation.toUpperCase()}`,
        fontBold, 12, rgb(0, 0, 0));

      // Column header at Y=325
      overlayText(page8, 430, 321, 110, 16, `${laborInputs.dutyHours} Hrs.`, fontBold, 12, rgb(0, 0, 0));

      const vx = 430;
      const vw = 110;

      // Row 1: Minimum wage (Y=301)
      overlayText(page8, vx, 297, vw, 18, formatINR(b.wagePerDay), font, 11, rgb(0, 0, 0));
      
      // Row 2: Basic (Y=268)
      overlayText(page8, vx, 264, vw, 18, formatINR(b.basic), font, 11, rgb(0, 0, 0));
      
      // Row 3: EPF (Y=245)
      overlayText(page8, vx, 241, vw, 18, formatINR(b.epf), font, 11, rgb(0, 0, 0));
      
      // Row 4: Gross 2 (Y=224)
      overlayText(page8, vx, 220, vw, 18, formatINR(b.gross2), font, 11, rgb(0, 0, 0));
      
      // Row 5: ESIC (Y=203)
      overlayText(page8, vx, 199, vw, 18, formatINR(b.esic), font, 11, rgb(0, 0, 0));
      
      // Row 6: Extra days (Y=181)
      overlayText(page8, vx, 177, vw, 18, formatINR(b.extraDaysAmount), font, 11, rgb(0, 0, 0));
      
      // Row 7: Uniform (Y=160)
      overlayText(page8, vx, 156, vw, 18, formatINR(b.uniform), font, 11, rgb(0, 0, 0));
      
      // Row 8: Extra hours (Y=138)
      overlayText(page8, vx, 134, vw, 18, formatINR(b.extraHoursAmount), font, 11, rgb(0, 0, 0));
      
      // Row 9: Gross 3 (Y=117)
      overlayText(page8, vx, 113, vw, 18, formatINR(b.gross3), font, 11, rgb(0, 0, 0));
      
      // Row 10: Service Charges (Y=95)
      overlayText(page8, vx, 91, vw, 18, formatINR(b.serviceCharge), font, 11, rgb(0, 0, 0));
      
      // Total (Y=72)
      overlayText(page8, vx, 68, vw, 18, formatINR(b.total), fontBold, 11, rgb(0, 0, 0));
    }

    // ═══════════════════════════════════════════════════════════════
    // PAGE 9: Quotation & Terms
    // ═══════════════════════════════════════════════════════════════
    const page9 = pdfDoc.getPage(8);

    // "Wages for 12 Hrs." header - at X=428, Y=598
    overlayText(page9, 428, 596, 115, 18, `Wages for ${laborInputs.dutyHours} Hrs.`, fontBold, 15, rgb(0, 0, 0));

    // Role 1: designation at X=215, Y=557; amount at X=451, Y=560
    if (breakdowns[0]) {
      overlayText(page9, 135, 555, 280, 16, roles[0].designation, font, 12, rgb(0, 0, 0));
      overlayText(page9, 430, 555, 110, 20, formatINR(breakdowns[0].total), font, 16, rgb(0, 0, 0));
    }

    // Role 2: designation at X=243, Y=518; amount at X=449, Y=519
    if (breakdowns[1]) {
      overlayText(page9, 135, 515, 280, 16, roles[1].designation, font, 12, rgb(0, 0, 0));
      overlayText(page9, 430, 515, 110, 20, formatINR(breakdowns[1].total), font, 16, rgb(0, 0, 0));
    }

    // Terms - "12 hrs." at X=83, Y=467 - cover whole line
    overlayText(page9, 83, 467, 410, 14,
      `The above-mentioned rates are based on ${laborInputs.dutyHours} hrs. basis as per state min-wages notification.`,
      font, 12, rgb(0, 0, 0));

    // "45 days" at X=83, Y=275
    overlayText(page9, 83, 275, 270, 14,
      `The rates are valid for ${contractTerms.proposalValidityDays} days from the date of proposal.`,
      font, 12, rgb(0, 0, 0));

    // "15 days" - "A Minimum 15 days lead-time..." at X=89, Y=234
    overlayText(page9, 89, 234, 420, 14,
      `A Minimum ${contractTerms.deploymentLeadTimeDays} days lead-time will be provided for selection, training and deployment of`,
      font, 12, rgb(0, 0, 0));

    // "One Year" at X=89, Y=179
    overlayText(page9, 89, 179, 200, 14,
      `The contract will be for ${contractTerms.contractDuration}.`,
      font, 12, rgb(0, 0, 0));

    // "one-month" at X=89, Y=166
    overlayText(page9, 89, 166, 440, 14,
      `The contract will be subject to termination on either side by giving ${contractTerms.terminationNoticePeriod} advance notice.`,
      font, 12, rgb(0, 0, 0));

    // ═══════════════════════════════════════════════════════════════
    // Save and send
    // ═══════════════════════════════════════════════════════════════
    const pdfBytes = await pdfDoc.save();

    const filename = `Quotation_${documentDetails.referenceNumber.replace(/\//g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.send(Buffer.from(pdfBytes));

    console.log(`✅ PDF generated: ${filename} (${pdfBytes.length} bytes)`);

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate PDF', message: error.message });
  }
});

/**
 * POST /api/quotation/preview
 * Returns calculated breakdowns as JSON
 */
router.post('/preview', (req, res) => {
  try {
    // ── Validate inputs ───────────────────────────────────────────────────────
    let laborInputs, roles;
    try {
      // preview only requires laborInputs and roles; supply stubs for the rest
      const stub = {
        documentDetails:  { referenceNumber: 'PREVIEW', proposalDate: 'N/A' },
        clientDetails:    { companyName: 'N/A', address: 'N/A', attentionSalutation: 'N/A' },
        contractTerms:    { proposalValidityDays: 30, deploymentLeadTimeDays: 15, contractDuration: 'N/A', terminationNoticePeriod: 'N/A' },
        ...req.body,
      };
      ({ laborInputs, roles } = validateRequestBody(stub));
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }
    // ── End validation ────────────────────────────────────────────────────────
    const breakdowns = roles.map(role => ({
      designation: role.designation,
      ...calculateBreakdown(role.minimumWage, laborInputs)
    }));

    res.json({
      success: true,
      breakdowns,
      summary: breakdowns.map(b => ({
        designation: b.designation,
        total: b.total,
        totalFormatted: `₹ ${formatINR(b.total)}`
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Calculation failed', message: error.message });
  }
});

module.exports = router;
