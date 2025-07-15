const express = require('express');
const line = require('@line/bot-sdk');
const app = express();

// LINE Bot Configuration
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// Create LINE SDK client
const client = new line.Client(config);

// Store user sessions
const userSessions = new Map();

// Problem types and solutions
const problemTypes = {
  '1': {
    name: 'ตู้กินเหรียญแล้วไม่ทำงาน',
    solutions: [
      'กรุณาลองกดปุ่ม "Reset" ที่ด้านข้างตู้ค้างไว้ 5 วินาที',
      'ตรวจสอบหน้าจอว่าแสดงผลปกติหรือไม่',
      'ลองใส่เหรียญอีกครั้งเพื่อทดสอบ',
      'หากยังไม่ได้ กรุณาติดต่อแอดมิน'
    ]
  },
  '2': {
    name: 'ตู้ค้างเครื่อง',
    solutions: [
      'กดปุ่ม "Reset" ที่ด้านข้างตู้ค้างไว้ 10 วินาที',
      'รอประมาณ 30 วินาที ให้ตู้รีสตาร์ทเอง',
      'ตรวจสอบว่าหน้าจอกลับมาแสดงผลปกติ',
      'ลองใส่เหรียญทดสอบอีกครั้ง'
    ]
  },
  '3': {
    name: 'ตู้คีบไม่แข็ง',
    solutions: [
      'ลองเล่นอีก 1-2 ครั้ง เพื่อทดสอบ',
      'ตรวจสอบว่าตู้แสดงข้อความ "แรงคีบปกติ" หรือไม่',
      'หากยังไม่แข็ง กรุณาติดต่อแอดมิน',
      'จะได้รับการปรับแรงคีบให้'
    ]
  },
  '4': {
    name: 'ตู้ไม่มีเสียง',
    solutions: [
      'ตรวจสอบปุ่มเสียงที่ตู้ว่าเปิดอยู่หรือไม่',
      'ลองกดปุ่ม Volume + ที่ตู้',
      'รีสตาร์ทตู้ด้วยการกดปุ่ม Reset',
      'หากยังไม่มีเสียง กรุณาแจ้งแอดมิน'
    ]
  },
  '5': {
    name: 'หยอดครบแล้ว ตุ๊กตาไม่ออก',
    solutions: [
      'ตรวจสอบว่าคีบจับตุ๊กตาแล้วหรือยัง',
      'ลองเขย่าตู้เบาๆ เพื่อให้ตุ๊กตาตก',
      'ตรวจสอบว่าตุ๊กตาติดอยู่หรือไม่',
      'หากตุ๊กตาไม่ออกจริง กรุณาแจ้งแอดมิน'
    ]
  }
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
  res.send('🤖 Claw Machine Support Bot is running!');
});

// Webhook endpoint
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// Handle events
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const userMessage = event.message.text;

  // Get or create user session
  if (!userSessions.has(userId)) {
    userSessions.set(userId, { step: 'start', data: {} });
  }

  const session = userSessions.get(userId);
  const replyMessage = await processUserMessage(userId, userMessage, session);

  return client.replyMessage(event.replyToken, replyMessage);
}

// Process user message
async function processUserMessage(userId, message, session) {
  switch (session.step) {
    case 'start':
      return handleStart(userId, message, session);
    
    case 'select_problem':
      return handleProblemSelection(userId, message, session);
    
    case 'troubleshooting':
      return handleTroubleshooting(userId, message, session);
    
    case 'get_machine_number':
      return handleMachineNumber(userId, message, session);
    
    case 'get_location':
      return handleLocation(userId, message, session);
    
    case 'get_customer_info':
      return handleCustomerInfo(userId, message, session);
    
    case 'get_evidence':
      return handleEvidence(userId, message, session);
    
    case 'get_account':
      return handleAccount(userId, message, session);
    
    default:
      return { type: 'text', text: 'ขออภัย เกิดข้อผิดพลาด กรุณาเริ่มใหม่' };
  }
}

// Handle start conversation
function handleStart(userId, message, session) {
  const quickReply = {
    type: 'text',
    text: '🎯 สวัสดีครับ! ยินดีต้อนรับสู่ระบบแก้ปัญหาตู้คีบตุ๊กตา\n\nกรุณาเลือกปัญหาที่คุณพบ:',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '1. ตู้กินเหรียญไม่ทำงาน', text: '1' } },
        { type: 'action', action: { type: 'message', label: '2. ตู้ค้างเครื่อง', text: '2' } },
        { type: 'action', action: { type: 'message', label: '3. ตู้คีบไม่แข็ง', text: '3' } },
        { type: 'action', action: { type: 'message', label: '4. ตู้ไม่มีเสียง', text: '4' } },
        { type: 'action', action: { type: 'message', label: '5. ตุ๊กตาไม่ออก', text: '5' } }
      ]
    }
  };

  session.step = 'select_problem';
  return quickReply;
}

// Handle problem selection
function handleProblemSelection(userId, message, session) {
  const problemKey = message.trim();
  
  if (!problemTypes[problemKey]) {
    return {
      type: 'text',
      text: 'กรุณาเลือกปัญหาที่ถูกต้อง (1-5)',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '1. ตู้กินเหรียญไม่ทำงาน', text: '1' } },
          { type: 'action', action: { type: 'message', label: '2. ตู้ค้างเครื่อง', text: '2' } },
          { type: 'action', action: { type: 'message', label: '3. ตู้คีบไม่แข็ง', text: '3' } },
          { type: 'action', action: { type: 'message', label: '4. ตู้ไม่มีเสียง', text: '4' } },
          { type: 'action', action: { type: 'message', label: '5. ตุ๊กตาไม่ออก', text: '5' } }
        ]
      }
    };
  }

  session.data.problemType = problemKey;
  session.data.problemName = problemTypes[problemKey].name;
  session.data.solutions = problemTypes[problemKey].solutions;
  session.data.currentStep = 0;
  session.step = 'troubleshooting';

  return {
    type: 'text',
    text: `🔧 ปัญหา: ${problemTypes[problemKey].name}\n\n` +
          `ขั้นตอนที่ 1: ${problemTypes[problemKey].solutions[0]}\n\n` +
          `กรุณาลองทำตามแล้วตอบว่า "แก้ได้" หรือ "ไม่ได้"`,
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '✅ แก้ได้', text: 'แก้ได้' } },
        { type: 'action', action: { type: 'message', label: '❌ ไม่ได้', text: 'ไม่ได้' } }
      ]
    }
  };
}

// Handle troubleshooting
function handleTroubleshooting(userId, message, session) {
  const response = message.trim();
  
  if (response === 'แก้ได้') {
    session.step = 'start';
    return {
      type: 'text',
      text: '🎉 ยินดีด้วย! ปัญหาได้รับการแก้ไขแล้ว\n\nขอบคุณที่ใช้บริการ หากมีปัญหาอื่น สามารถติดต่อได้ตลอดเวลา',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '🔄 เริ่มใหม่', text: 'เริ่มใหม่' } }
        ]
      }
    };
  }
  
  if (response === 'ไม่ได้') {
    session.data.currentStep++;
    
    if (session.data.currentStep < session.data.solutions.length) {
      return {
        type: 'text',
        text: `ขั้นตอนที่ ${session.data.currentStep + 1}: ${session.data.solutions[session.data.currentStep]}\n\n` +
              `กรุณาลองทำตามแล้วตอบว่า "แก้ได้" หรือ "ไม่ได้"`,
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '✅ แก้ได้', text: 'แก้ได้' } },
            { type: 'action', action: { type: 'message', label: '❌ ไม่ได้', text: 'ไม่ได้' } }
          ]
        }
      };
    } else {
      session.step = 'get_machine_number';
      return {
        type: 'text',
        text: '😔 ขออภัย ไม่สามารถแก้ปัญหาได้ด้วยวิธีปกติ\n\n' +
              '📝 ขอเก็บข้อมูลเพื่อดำเนินการโอนเงินคืน + ตุ๊กตาฟรี 1 ตัว\n\n' +
              '🎯 กรุณาใส่หมายเลขตู้ (เช่น A001, B052)'
      };
    }
  }
  
  return {
    type: 'text',
    text: 'กรุณาตอบ "แก้ได้" หรือ "ไม่ได้" เท่านั้น',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '✅ แก้ได้', text: 'แก้ได้' } },
        { type: 'action', action: { type: 'message', label: '❌ ไม่ได้', text: 'ไม่ได้' } }
      ]
    }
  };
}

// Handle machine number
function handleMachineNumber(userId, message, session) {
  const machineNumber = message.trim().toUpperCase();
  
  if (machineNumber.length < 3) {
    return {
      type: 'text',
      text: '❌ รูปแบบหมายเลขตู้ไม่ถูกต้อง\n\nกรุณาใส่หมายเลขตู้ที่ติดอยู่บนตู้ (เช่น A001, B052, C123)'
    };
  }
  
  session.data.machineNumber = machineNumber;
  session.step = 'get_location';
  
  return {
    type: 'text',
    text: `✅ หมายเลขตู้: ${machineNumber}\n\n` +
          '📍 กรุณาระบุสถานที่ตั้งตู้:\n\n' +
          '🏪 หากอยู่ในเซเว่น: ระบุชื่อสาขาและรหัสสาขา\n' +
          '🏢 หากอยู่หน้าเซเว่น: ระบุที่อยู่ร้าน\n' +
          '🏬 หากอยู่ที่อื่น: ระบุที่อยู่ที่ชัดเจน'
  };
}

// Handle location
function handleLocation(userId, message, session) {
  const location = message.trim();
  
  if (location.length < 10) {
    return {
      type: 'text',
      text: '❌ ข้อมูลสถานที่ไม่ครบถ้วน\n\nกรุณาระบุสถานที่ที่ชัดเจน เช่น:\n' +
            '• เซเว่น สาขาสยาม รหัส 00123\n' +
            '• หน้าเซเว่น ซอยลาดพร้าว 15\n' +
            '• ห้างสรรพสินค้า ABC ชั้น 3'
    };
  }
  
  session.data.location = location;
  session.step = 'get_customer_info';
  
  return {
    type: 'text',
    text: `✅ สถานที่: ${location}\n\n` +
          '👤 กรุณาระบุข้อมูลส่วนตัว:\n\n' +
          'รูปแบบ: ชื่อ-นามสกุล, เบอร์โทร, จำนวนเงินที่เสีย\n\n' +
          'ตัวอย่าง:\nสมชาย ใจดี, 081-234-5678, 40 บาท'
  };
}

// Handle customer info
function handleCustomerInfo(userId, message, session) {
  const info = message.trim();
  const parts = info.split(',');
  
  if (parts.length < 3) {
    return {
      type: 'text',
      text: '❌ ข้อมูลไม่ครบถ้วน\n\nกรุณาระบุ:\nชื่อ-นามสกุล, เบอร์โทร, จำนวนเงินที่เสีย\n\n' +
            'ตัวอย่าง:\nสมชาย ใจดี, 081-234-5678, 40 บาท'
    };
  }
  
  session.data.customerName = parts[0].trim();
  session.data.customerPhone = parts[1].trim();
  session.data.lostAmount = parts[2].trim();
  session.step = 'get_evidence';
  
  return {
    type: 'text',
    text: `✅ ข้อมูลลูกค้า:\n` +
          `• ชื่อ: ${session.data.customerName}\n` +
          `• เบอร์: ${session.data.customerPhone}\n` +
          `• จำนวนเงิน: ${session.data.lostAmount}\n\n` +
          '📸 กรุณาส่งหลักฐาน:\n\n' +
          '1. รูปหน้าจอตู้ที่แสดงการหยอดเงิน\n' +
          '2. วิดีโอการหยอดเงิน (ถ้ามี)\n' +
          '3. รูปตู้ที่เกิดปัญหา\n\n' +
          'หากลืมถ่าย กรุณาลองหยอดใหม่และถ่ายหลักฐาน\n\n' +
          'พิมพ์ "ส่งหลักฐานเรียบร้อย" เมื่อส่งครบแล้ว'
  };
}

// Handle evidence
function handleEvidence(userId, message, session) {
  if (message.includes('ส่งหลักฐานเรียบร้อย')) {
    session.step = 'get_account';
    return {
      type: 'text',
      text: '✅ ได้รับหลักฐานเรียบร้อย\n\n' +
            '🏧 ขั้นตอนสุดท้าย: กรุณาส่งเลขบัญชี\n\n' +
            'รูปแบบ: ธนาคาร, เลขบัญชี, ชื่อบัญชี\n\n' +
            'ตัวอย่าง:\nกสิกรไทย, 123-4-56789-0, นายสมชาย ใจดี'
    };
  }
  
  return {
    type: 'text',
    text: '📸 กรุณาส่งหลักฐานตามที่ระบุ:\n\n' +
          '1. รูปหน้าจอตู้ที่แสดงการหยอดเงิน\n' +
          '2. วิดีโอการหยอดเงิน (ถ้ามี)\n' +
          '3. รูปตู้ที่เกิดปัญหา\n\n' +
          'พิมพ์ "ส่งหลักฐานเรียบร้อย" เมื่อส่งครบแล้ว'
  };
}

// Handle account
async function handleAccount(userId, message, session) {
  const accountInfo = message.trim();
  const parts = accountInfo.split(',');
  
  if (parts.length < 3) {
    return {
      type: 'text',
      text: '❌ ข้อมูลบัญชีไม่ครบถ้วน\n\nกรุณาระบุ:\nธนาคาร, เลขบัญชี, ชื่อบัญชี\n\n' +
            'ตัวอย่าง:\nกสิกรไทย, 123-4-56789-0, นายสมชาย ใจดี'
    };
  }
  
  session.data.bankName = parts[0].trim();
  session.data.accountNumber = parts[1].trim();
  session.data.accountName = parts[2].trim();
  session.data.timestamp = new Date().toISOString();
  
  // แสดงข้อมูลที่เก็บได้ใน console
  console.log('=== ข้อมูลลูกค้าใหม่ ===');
  console.log('เวลา:', session.data.timestamp);
  console.log('ปัญหา:', session.data.problemName);
  console.log('หมายเลขตู้:', session.data.machineNumber);
  console.log('สถานที่:', session.data.location);
  console.log('ชื่อลูกค้า:', session.data.customerName);
  console.log('เบอร์โทร:', session.data.customerPhone);
  console.log('จำนวนเงิน:', session.data.lostAmount);
  console.log('ธนาคาร:', session.data.bankName);
  console.log('เลขบัญชี:', session.data.accountNumber);
  console.log('ชื่อบัญชี:', session.data.accountName);
  console.log('========================');
  
  // Send to admin (แสดงข้อมูลสำหรับแอดมิน)
  await notifyAdmin(session.data);
  
  // Reset session
  session.step = 'start';
  session.data = {};
  
  return {
    type: 'text',
    text: '🎉 ข้อมูลครบถ้วนแล้ว!\n\n' +
          '✅ ข้อมูลได้ถูกส่งไปยังแอดมินเรียบร้อย\n' +
          '💰 จะดำเนินการโอนเงินคืน + ตุ๊กตาฟรี 1 ตัว\n' +
          '⏰ ภายใน 24 ชั่วโมง\n\n' +
          'ขอบคุณที่ใช้บริการ! 🙏',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '🔄 เริ่มใหม่', text: 'เริ่มใหม่' } }
      ]
    }
  };
}

// Notify admin (แสดงข้อมูลใน console แทน)
async function notifyAdmin(data) {
  const adminMessage = `🚨 แจ้งเตือนปัญหาตู้คีบใหม่\n\n` +
                      `📅 วันที่: ${new Date(data.timestamp).toLocaleString('th-TH')}\n` +
                      `🔧 ปัญหา: ${data.problemName}\n` +
                      `🎯 หมายเลขตู้: ${data.machineNumber}\n` +
                      `📍 สถานที่: ${data.location}\n` +
                      `👤 ลูกค้า: ${data.customerName}\n` +
                      `📞 เบอร์: ${data.customerPhone}\n` +
                      `💰 จำนวนเงิน: ${data.lostAmount}\n` +
                      `🏦 ธนาคาร: ${data.bankName}\n` +
                      `💳 เลขบัญชี: ${data.accountNumber}\n` +
                      `📝 ชื่อบัญชี: ${data.accountName}\n\n` +
                      `⚡ ต้องโอนเงินคืน + ตุ๊กตาฟรี 1 ตัว`;
  
  console.log('=== แจ้งเตือนแอดมิน ===');
  console.log(adminMessage);
  console.log('=====================');
}

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🤖 Claw Machine Support Bot running on port ${port}`);
});

module.exports = app;
