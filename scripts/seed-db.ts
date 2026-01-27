import '../src/config/env';
import { getDatabase, closeDatabase } from '../src/database';
import { createCustomer, createAppointment, createCallRecord, updateCallRecord } from '../src/services/customers';

console.log('Seeding database...');

// Ensure DB is initialized
getDatabase();

// Seed customers
const c1 = createCustomer({ name: 'James Wilson', phone: '+18045551234', email: 'james@email.com' });
const c2 = createCustomer({ name: 'Marcus Johnson', phone: '+18045555678', email: 'marcus.j@email.com' });
const c3 = createCustomer({ name: 'Tyler Brooks', phone: '+18045559012' });

console.log(`Created ${3} customers`);

// Seed appointments
const today = new Date().toISOString().split('T')[0];
createAppointment({ customer_id: c1.id, service: 'Fade', staff: 'Marcus', date: today, time: '10:00 AM', duration: 35 });
createAppointment({ customer_id: c2.id, service: 'Haircut + Beard', staff: 'DeShawn', date: today, time: '11:00 AM', duration: 45 });
createAppointment({ customer_id: c3.id, service: 'Regular Haircut', staff: 'Tony', date: today, time: '2:00 PM', duration: 30 });

console.log(`Created ${3} appointments`);

// Seed call records
const call1 = createCallRecord({ call_sid: 'CA_seed_001', phone_number: '+18045551234', direction: 'inbound', customer_id: c1.id });
updateCallRecord('CA_seed_001', { duration: 120, transcript: 'Caller: Hi, I want to book a fade.\nBot: Sure! When works for you?\nCaller: Today at 10 AM.\nBot: Got it, booked with Marcus at 10 AM.', summary: 'Returning customer James booked a fade with Marcus for today at 10 AM.', lead_captured: 1, appointment_booked: 1, status: 'completed' });

const call2 = createCallRecord({ call_sid: 'CA_seed_002', phone_number: '+18045559999', direction: 'inbound' });
updateCallRecord('CA_seed_002', { duration: 45, transcript: 'Caller: What time do you close?\nBot: We\'re open until 7 PM today.\nCaller: Thanks!', summary: 'New caller asked about business hours. No appointment booked.', status: 'completed' });

console.log(`Created ${2} call records`);
console.log('Done!');

closeDatabase();
