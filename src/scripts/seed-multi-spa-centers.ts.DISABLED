import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ReplyData from '../models/ReplyData';
import User from '../models/User';

dotenv.config();

// ============================================
// MULTI-SPA CENTERS DATA STRUCTURE
// ============================================
// Each spa center can have different services, pricing, and details

interface ServicePrice {
  duration: number;  // in minutes
  price: number;     // in rupees
}

interface Service {
  name: string;
  description: string;
  prices: ServicePrice[];
  benefits?: string[];
  includes?: string[];
  availableAt?: string[];  // Which spa centers offer this (leave empty for all)
}

interface SpaCenter {
  spaName: string;
  locationName: string;
  address: string;
  landmark?: string;
  city: string;
  state?: string;
  pincode?: string;
  contactNumber?: string;
  whatsappNumber?: string;
  email?: string;
  website?: string;
  googleMapsLink?: string;
  
  timings: {
    weekdays?: string;
    weekends?: string;
    holidays?: string;
  };
  
  amenities?: string[];
  specialFeatures?: string[];
  parkingAvailable?: boolean;
  
  // Services specific to this center (optional - if not provided, uses common services)
  services?: Service[];
  
  // Popular services at this center
  popularServices?: string[];
  
  // Special offers at this center
  offers?: string[];
  
  active: boolean;
}

// ============================================
// DEFINE YOUR SPA CENTERS HERE
// ============================================

const spaCenters: SpaCenter[] = [
  // === SPA CENTER 1 ===
  {
    spaName: 'Delight Spa',
    locationName: 'Gomti Nagar Branch',
    address: 'Shop No. 15, Viraj Khand, Gomti Nagar',
    landmark: 'Near Phoenix United Mall',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pincode: '226010',
    contactNumber: '0522-4567890',
    whatsappNumber: '9876543210',
    email: 'gomtinagar@delightspa.com',
    website: 'https://spaadvisor.in/',
    googleMapsLink: 'https://maps.google.com/?q=Delight+Spa+Gomti+Nagar',
    
    timings: {
      weekdays: '10:00 AM - 9:00 PM (Monday to Friday)',
      weekends: '10:00 AM - 10:00 PM (Saturday & Sunday)',
      holidays: 'Open on all holidays'
    },
    
    amenities: ['Jacuzzi', 'Steam Room', 'Sauna', 'Private Rooms', 'Couple Rooms', 'Changing Rooms', 'Lockers', 'Shower Facilities'],
    specialFeatures: ['Four Hand Massage Available', 'Couple Treatments', 'Hammam Bath', 'Premium Oils', 'Ladies Special Section'],
    parkingAvailable: true,
    
    popularServices: ['Thai Massage', 'Deep Tissue Massage', 'Couple Special', 'Full Body Oil Massage'],
    
    offers: [
      '20% off on first visit',
      'Couple package - Book 2 get 10% off',
      'Refer a friend and get ₹500 off'
    ],
    
    active: true
  },
  
  // === GOA SPA CENTERS ===
  
  // === SPA CENTER 2: Goa Main Spa ===
  {
    spaName: 'Goa Luxury Spa',
    locationName: 'Main Center',
    address: 'Goa',
    landmark: 'Contact for exact location',
    city: 'Goa',
    state: 'Goa',
    pincode: '',
    contactNumber: undefined,
    whatsappNumber: undefined,
    email: undefined,
    website: 'https://spaadvisor.in/',
    googleMapsLink: undefined,
    
    timings: {
      weekdays: 'Please visit https://spaadvisor.in/ for timings',
      weekends: 'Please visit https://spaadvisor.in/ for timings',
      holidays: 'Please check website for holiday schedule'
    },
    
    amenities: ['Jacuzzi', 'Private Jacuzzi Suites', 'Couple Spa Rooms', 'Aromatherapy', 'Premium Oils'],
    specialFeatures: ['Four Hand Massage', 'Couple Treatments', 'Aromatherapy Specialist', 'Jacuzzi Rituals'],
    parkingAvailable: undefined,
    
    services: [
      {
        name: 'Head Massage',
        description: 'Relaxing head massage for stress relief',
        prices: [
          { duration: 45, price: 1999 },
          { duration: 60, price: 2499 }
        ],
        benefits: ['Stress relief', 'Headache relief']
      },
      {
        name: 'Foot Massage',
        description: 'Soothing foot reflexology',
        prices: [
          { duration: 45, price: 1999 },
          { duration: 60, price: 2499 }
        ],
        benefits: ['Relaxation', 'Circulation']
      },
      {
        name: 'Back Massage',
        description: 'Targeted back pain relief',
        prices: [
          { duration: 45, price: 1999 },
          { duration: 60, price: 2499 }
        ],
        benefits: ['Pain relief', 'Tension relief']
      },
      {
        name: 'Full Body Oil Massage',
        description: 'Traditional full body massage with premium oils',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 }
        ],
        benefits: ['Deep relaxation', 'Skin nourishment']
      },
      {
        name: 'Full Body Massage + Scrub',
        description: 'Massage with exfoliating body scrub',
        prices: [
          { duration: 60, price: 2999 },
          { duration: 90, price: 3999 }
        ],
        includes: ['Full body massage', 'Body scrub']
      },
      {
        name: 'Thai Massage',
        description: 'Traditional Thai massage techniques',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 },
          { duration: 120, price: 4499 }
        ],
        benefits: ['Flexibility', 'Energy flow']
      },
      {
        name: 'Swedish Massage',
        description: 'Classic Swedish relaxation',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 },
          { duration: 120, price: 4499 }
        ],
        benefits: ['Gentle relaxation', 'Stress relief']
      },
      {
        name: 'Balinese Massage',
        description: 'Traditional Balinese therapy',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 },
          { duration: 120, price: 4499 }
        ],
        benefits: ['Deep tissue work', 'Energy balance']
      },
      {
        name: 'Four Hand Massage',
        description: 'Synchronized massage by 2 therapists',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 6999 },
          { duration: 120, price: 8999 }
        ],
        benefits: ['Ultimate relaxation', 'Luxury experience']
      },
      {
        name: 'Couple Special Treatment',
        description: 'Romantic couple massage with 4 therapists',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 6999 },
          { duration: 120, price: 8999 }
        ],
        benefits: ['Romantic', 'Together relaxation']
      },
      {
        name: 'Jacuzzi + Scrub Package',
        description: 'Relaxing jacuzzi with body scrub',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 7999 },
          { duration: 120, price: 13999 }
        ],
        includes: ['Jacuzzi session', 'Body scrub']
      }
    ],
    
    popularServices: ['Four Hand Massage', 'Thai Massage', 'Couple Special', 'Jacuzzi Packages'],
    
    offers: [
      'First-time visitor special rates',
      'Couple package discounts available'
    ],
    
    active: true
  },
  
  // === SPA CENTER 3: Ella Spa - Tiswadi ===
  {
    spaName: 'Ella Spa',
    locationName: 'Tiswadi',
    address: 'Tiswadi, Goa',
    landmark: 'Contact for exact location',
    city: 'Tiswadi',
    state: 'Goa',
    pincode: '',
    contactNumber: undefined,
    whatsappNumber: undefined,
    email: undefined,
    website: 'https://spaadvisor.in/',
    googleMapsLink: undefined,
    
    timings: {
      weekdays: 'Visit https://spaadvisor.in/ for timings and appointments',
      weekends: 'Visit https://spaadvisor.in/ for timings',
      holidays: 'Check website for holiday schedule'
    },
    
    amenities: ['Private Jacuzzi Suites', 'Couple Spa Rooms', 'Premium Oils', 'Changing Rooms'],
    specialFeatures: ['Traditional Techniques', 'Modern Comfort', 'Serene Environment'],
    parkingAvailable: undefined,
    
    services: [
      {
        name: 'Oil Massage',
        description: 'Traditional oil massage therapy',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 },
          { duration: 120, price: 4999 }
        ],
        benefits: ['Relaxation', 'Skin nourishment']
      },
      {
        name: 'Thai Massage',
        description: 'Traditional Thai techniques',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 },
          { duration: 120, price: 4999 }
        ],
        benefits: ['Flexibility', 'Energy flow']
      },
      {
        name: 'Four Hand Massage',
        description: 'Synchronized massage by 2 therapists',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 6999 },
          { duration: 120, price: 8999 }
        ],
        benefits: ['Ultimate relaxation', 'Luxury']
      },
      {
        name: 'Couple Special',
        description: 'Romantic couple treatment',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 6999 },
          { duration: 120, price: 8999 }
        ],
        benefits: ['Romantic experience', 'Together relaxation']
      },
      {
        name: 'French Aroma Massage',
        description: 'Aromatic massage with essential oils',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 },
          { duration: 120, price: 4499 }
        ],
        benefits: ['Aromatherapy', 'Relaxation']
      },
      {
        name: 'Swedish Massage',
        description: 'Classic Swedish relaxation',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 },
          { duration: 120, price: 4499 }
        ],
        benefits: ['Gentle relaxation', 'Stress relief']
      },
      {
        name: 'Scrub + Jacuzzi Package',
        description: 'Exfoliating scrub with jacuzzi relaxation',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 6999 },
          { duration: 120, price: 7999 }
        ],
        includes: ['Body scrub', 'Jacuzzi session']
      }
    ],
    
    popularServices: ['Oil Massage', 'Thai Massage', 'Couple Special', 'Scrub + Jacuzzi'],
    
    offers: [
      'Beach vacation special packages available'
    ],
    
    active: true
  },
  
  // === SPA CENTER 4: Lotus Spa - Dabolim ===
  {
    spaName: 'Lotus Spa',
    locationName: 'Dabolim',
    address: 'Near Dabolim Airport, Goa',
    landmark: 'Minutes from Dabolim Airport',
    city: 'Dabolim',
    state: 'Goa',
    pincode: '',
    contactNumber: undefined,
    whatsappNumber: undefined,
    email: undefined,
    website: 'https://spaadvisor.in/',
    googleMapsLink: undefined,
    
    timings: {
      weekdays: 'For timings and bookings, visit https://spaadvisor.in/',
      weekends: 'Check https://spaadvisor.in/ for weekend hours',
      holidays: 'Please check website'
    },
    
    amenities: ['Jacuzzi', 'Private Rooms', 'Aromatherapy Oils', 'Shower Facilities'],
    specialFeatures: ['Traveler-friendly Packages', 'Express Service', 'Airport Proximity'],
    parkingAvailable: true,
    
    services: [
      {
        name: 'Full Body Oil Massage',
        description: 'Perfect relaxation before or after travel',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 }
        ],
        benefits: ['Travel fatigue relief', 'Relaxation']
      },
      {
        name: 'Thai Massage',
        description: 'Traditional Thai therapy',
        prices: [
          { duration: 60, price: 2999 },
          { duration: 90, price: 3999 },
          { duration: 120, price: 4999 }
        ],
        benefits: ['Energy boost', 'Jet lag relief']
      },
      {
        name: 'Four Hand Massage',
        description: 'Luxury treatment by 2 therapists',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 6999 },
          { duration: 120, price: 8999 }
        ],
        benefits: ['Ultimate relaxation', 'Luxury experience']
      },
      {
        name: 'Scrub + Jacuzzi Combo',
        description: 'Refreshing scrub with jacuzzi',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 6999 },
          { duration: 120, price: 7999 }
        ],
        includes: ['Body scrub', 'Jacuzzi session']
      }
    ],
    
    popularServices: ['Full Body Oil Massage', 'Thai Massage', 'Four Hand Massage'],
    
    offers: [
      'Traveler special - Show flight ticket for 10% off',
      'Express service available'
    ],
    
    active: true
  },
  
  // === SPA CENTER 5: Wellness Villa Spa - Candolim ===
  {
    spaName: 'Wellness Villa Spa',
    locationName: 'Candolim',
    address: 'Near Candolim Beach, North Goa',
    landmark: 'Near Candolim Beach',
    city: 'Candolim',
    state: 'Goa',
    pincode: '',
    contactNumber: undefined,
    whatsappNumber: undefined,
    email: undefined,
    website: 'https://spaadvisor.in/',
    googleMapsLink: undefined,
    
    timings: {
      weekdays: 'For bookings and timings, visit https://spaadvisor.in/',
      weekends: 'Visit https://spaadvisor.in/ for weekend schedule',
      holidays: 'Check website for availability'
    },
    
    amenities: ['Jacuzzi', 'Private Couple Rooms', 'Beach-side Ambiance', 'Premium Luxury Oils', 'Changing Rooms'],
    specialFeatures: ['Beach-side Location', 'Exclusive Couple Rooms', 'Luxury Oils', 'Romantic Ambiance'],
    parkingAvailable: true,
    
    services: [
      {
        name: 'Oil Massage',
        description: 'Relaxing oil massage with premium oils',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 },
          { duration: 120, price: 4999 }
        ],
        benefits: ['Beach vacation relaxation', 'Premium experience']
      },
      {
        name: 'Thai Massage',
        description: 'Traditional Thai techniques',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 },
          { duration: 120, price: 4999 }
        ],
        benefits: ['Energy boost', 'Flexibility']
      },
      {
        name: 'Four Hand Massage',
        description: 'Luxury synchronized massage',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 6999 },
          { duration: 120, price: 8999 }
        ],
        benefits: ['Ultimate luxury', 'Deep relaxation']
      },
      {
        name: 'Couple Spa Ritual',
        description: 'Premium couple experience',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 6999 },
          { duration: 120, price: 8999 }
        ],
        benefits: ['Romantic', 'Beach vacation special']
      },
      {
        name: 'Scrub + Jacuzzi Package',
        description: 'Complete spa package',
        prices: [
          { duration: 60, price: 4999 },
          { duration: 90, price: 7999 },
          { duration: 120, price: 13999 }
        ],
        includes: ['Body scrub', 'Private jacuzzi']
      },
      {
        name: 'French Aroma Massage',
        description: 'Aromatherapy with French techniques',
        prices: [
          { duration: 60, price: 2499 },
          { duration: 90, price: 3499 }
        ],
        benefits: ['Aromatherapy', 'Mood enhancement']
      },
      {
        name: 'Deep Tissue Therapy',
        description: 'Therapeutic deep tissue massage',
        prices: [
          { duration: 60, price: 2999 },
          { duration: 90, price: 3999 }
        ],
        benefits: ['Pain relief', 'Muscle tension relief']
      }
    ],
    
    popularServices: ['Couple Spa Ritual', 'Four Hand Massage', 'Scrub + Jacuzzi', 'Oil Massage'],
    
    offers: [
      'Beach vacation special packages',
      'Couple romantic experience discounts'
    ],
    
    active: true
  }
];

// ============================================
// COMMON SERVICES (Available at all centers unless specified)
// ============================================

const commonServices: Service[] = [
  // Basic Massages
  {
    name: 'Head Massage',
    description: 'Relaxing head massage for stress relief and headache',
    prices: [
      { duration: 45, price: 1499 },
      { duration: 60, price: 1499 },
      { duration: 90, price: 1999 }
    ],
    benefits: ['Stress relief', 'Headache relief', 'Better sleep']
  },
  {
    name: 'Foot Reflexology',
    description: 'Therapeutic foot massage using pressure points',
    prices: [
      { duration: 45, price: 1499 },
      { duration: 60, price: 1499 },
      { duration: 90, price: 1999 }
    ],
    benefits: ['Wellness', 'Circulation', 'Energy boost']
  },
  {
    name: 'Back Massage',
    description: 'Targeted massage for back pain and tension',
    prices: [
      { duration: 45, price: 1499 },
      { duration: 60, price: 1499 },
      { duration: 90, price: 1999 }
    ],
    benefits: ['Back pain relief', 'Tension relief', 'Better posture']
  },
  {
    name: 'Full Body Oil Massage',
    description: 'Traditional full body massage with aromatic oils',
    prices: [
      { duration: 60, price: 1999 },
      { duration: 90, price: 2999 },
      { duration: 120, price: 2999 }
    ],
    benefits: ['Deep relaxation', 'Skin nourishment', 'Stress relief']
  },
  
  // Thai Massage
  {
    name: 'Full Body Thai Massage',
    description: 'Traditional Thai massage with stretching and acupressure',
    prices: [
      { duration: 60, price: 2199 },
      { duration: 90, price: 3199 },
      { duration: 120, price: 4199 }
    ],
    benefits: ['Flexibility', 'Energy flow', 'Deep relaxation']
  },
  
  // Specialty Massages
  {
    name: 'Swedish Massage',
    description: 'Classic relaxation massage with gentle strokes',
    prices: [
      { duration: 60, price: 1999 },
      { duration: 90, price: 2999 },
      { duration: 120, price: 3999 }
    ],
    benefits: ['Gentle relaxation', 'Stress relief', 'Better circulation']
  },
  {
    name: 'Deep Tissue Massage',
    description: 'Intense massage for chronic pain and muscle tension',
    prices: [
      { duration: 60, price: 2199 },
      { duration: 90, price: 3199 },
      { duration: 120, price: 4199 }
    ],
    benefits: ['Chronic pain relief', 'Muscle tension relief', 'Injury recovery']
  },
  
  // Packages
  {
    name: 'Thai Massage + Scrub + Jacuzzi',
    description: 'Complete Thai spa experience',
    prices: [
      { duration: 60, price: 4999 },
      { duration: 90, price: 6499 },
      { duration: 120, price: 7999 }
    ],
    includes: ['Thai massage', 'Body scrub', 'Jacuzzi session']
  },
  {
    name: 'Full Body Massage + Scrub + Jacuzzi',
    description: 'Complete spa package with all amenities',
    prices: [
      { duration: 60, price: 4999 },
      { duration: 90, price: 6499 },
      { duration: 120, price: 7999 }
    ],
    includes: ['Full body massage', 'Body scrub', 'Jacuzzi']
  },
  
  // Couple Treatments
  {
    name: 'Four Hand Couple Special',
    description: 'Special couple treatment with four therapists',
    prices: [
      { duration: 60, price: 4999 },
      { duration: 90, price: 6999 },
      { duration: 120, price: 8999 }
    ],
    benefits: ['Romantic experience', 'Together relaxation', 'Special bonding']
  },
  {
    name: 'Four Hand Couple + Jacuzzi',
    description: 'Complete couple spa experience with jacuzzi',
    prices: [
      { duration: 60, price: 5999 },
      { duration: 90, price: 7999 },
      { duration: 120, price: 9999 }
    ],
    includes: ['Couple massage (4 therapists)', 'Jacuzzi session'],
    benefits: ['Perfect for anniversaries', 'Romantic', 'Ultimate relaxation']
  },
  
  // Special Treatments
  {
    name: 'Hammam Massage',
    description: 'Traditional Turkish bath and massage experience',
    prices: [
      { duration: 60, price: 5999 },
      { duration: 90, price: 6999 },
      { duration: 120, price: 7999 }
    ],
    benefits: ['Deep cleansing', 'Traditional therapy', 'Unique experience']
  }
];

// ============================================
// AUTO-GENERATION LOGIC
// ============================================

function generateMultiSpaQA(spaCenters: SpaCenter[], commonServices: Service[]): any[] {
  const qaEntries: any[] = [];
  const websiteUrl = 'https://spaadvisor.in/';
  
  // 1. General Information
  const activeSpas = spaCenters.filter(s => s.active);
  
  qaEntries.push({
    key: 'how many spa centers locations branches',
    value: `We have ${activeSpas.length} spa center${activeSpas.length > 1 ? 's' : ''}: ${activeSpas.map(s => `${s.spaName} - ${s.locationName}`).join(', ')}. Which location interests you?`,
    priority: 10,
    tags: ['locations', 'centers', 'branches']
  });
  
  qaEntries.push({
    key: 'website more information details visit',
    value: `For complete information, visit our website: ${websiteUrl}. You can find all spa details, services, pricing, and book online!`,
    priority: 9,
    tags: ['website', 'information', 'online']
  });
  
  // 2. Generate Q&A for each spa center
  activeSpas.forEach(spa => {
    const spaKey = `${spa.spaName.toLowerCase()} ${spa.locationName.toLowerCase()}`;
    
    // Address and contact
    qaEntries.push({
      key: `${spaKey} address location where contact`,
      value: `${spa.spaName} - ${spa.locationName}: ${spa.address}, ${spa.city}${spa.landmark ? `, near ${spa.landmark}` : ''}. ${spa.contactNumber ? `Ph: ${spa.contactNumber}` : ''}${spa.whatsappNumber ? `, WhatsApp: ${spa.whatsappNumber}` : ''}${spa.email ? `, Email: ${spa.email}` : ''}. ${spa.googleMapsLink ? `Maps: ${spa.googleMapsLink}` : ''}`,
      priority: 10,
      tags: ['address', 'contact', spa.spaName, spa.locationName]
    });
    
    // Timings
    qaEntries.push({
      key: `${spaKey} timings hours open close`,
      value: `${spa.spaName} - ${spa.locationName} timings: ${spa.timings.weekdays || 'Please call for timings'}${spa.timings.weekends ? `. Weekends: ${spa.timings.weekends}` : ''}${spa.timings.holidays ? `. Holidays: ${spa.timings.holidays}` : ''}.`,
      priority: 9,
      tags: ['timings', 'hours', spa.spaName]
    });
    
    // Amenities
    if (spa.amenities && spa.amenities.length > 0) {
      qaEntries.push({
        key: `${spaKey} amenities facilities available what`,
        value: `${spa.spaName} - ${spa.locationName} facilities: ${spa.amenities.join(', ')}${spa.specialFeatures ? `. Special features: ${spa.specialFeatures.join(', ')}` : ''}. ${spa.parkingAvailable ? 'Parking available.' : 'Limited parking.'}`,
        priority: 8,
        tags: ['amenities', 'facilities', spa.spaName]
      });
    }
    
    // Offers
    if (spa.offers && spa.offers.length > 0) {
      qaEntries.push({
        key: `${spaKey} offers discounts deals special`,
        value: `${spa.spaName} - ${spa.locationName} special offers: ${spa.offers.join(' • ')}. Limited time! Book now to avail!`,
        priority: 10,
        tags: ['offers', 'discounts', 'deals', spa.spaName]
      });
    }
    
    // Popular services
    if (spa.popularServices && spa.popularServices.length > 0) {
      qaEntries.push({
        key: `${spaKey} popular best recommended services`,
        value: `Most popular at ${spa.spaName} - ${spa.locationName}: ${spa.popularServices.join(', ')}. Highly recommended by our guests!`,
        priority: 9,
        tags: ['popular', 'recommended', spa.spaName]
      });
    }
    
    // Google Maps
    if (spa.googleMapsLink) {
      qaEntries.push({
        key: `${spaKey} directions map google maps how to reach`,
        value: `Get directions to ${spa.spaName} - ${spa.locationName}: ${spa.googleMapsLink}. Located at ${spa.address}, ${spa.city}${spa.landmark ? `, near ${spa.landmark}` : ''}.`,
        priority: 8,
        tags: ['directions', 'maps', 'navigation', spa.spaName]
      });
    }
  });
  
  // 3. Spa-specific services Q&A
  activeSpas.forEach(spa => {
    if (spa.services && spa.services.length > 0) {
      const spaKey = `${spa.spaName.toLowerCase()} ${spa.locationName.toLowerCase()}`;
      
      spa.services.forEach(service => {
        const priceText = service.prices.map(p => `${p.duration}min ₹${p.price}`).join(', ');
        const nameLower = service.name.toLowerCase();
        
        // Service Q&A with spa name
        qaEntries.push({
          key: `${nameLower} ${spaKey} price cost`,
          value: `${service.name} at ${spa.spaName} - ${spa.locationName}: ${priceText}. ${service.description}${service.benefits ? `. Benefits: ${service.benefits.join(', ')}` : ''}${service.includes ? `. Includes: ${service.includes.join(', ')}` : ''}.`,
          priority: 9,
          tags: [nameLower, 'service', spa.spaName, spa.locationName]
        });
        
        // Also add general service Q&A
        qaEntries.push({
          key: `${nameLower} price cost rate`,
          value: `${service.name}: ${priceText} (at ${spa.spaName} - ${spa.locationName}). ${service.description}${service.benefits ? `. Benefits: ${service.benefits.join(', ')}` : ''}.`,
          priority: 8,
          tags: [nameLower, 'service', 'pricing']
        });
      });
    }
  });
  
  // 4. Common services Q&A
  commonServices.forEach(service => {
    const priceText = service.prices.map(p => `${p.duration}min ₹${p.price}`).join(', ');
    const nameLower = service.name.toLowerCase();
    
    qaEntries.push({
      key: `${nameLower} price cost rate`,
      value: `${service.name}: ${priceText}. ${service.description}${service.benefits ? `. Benefits: ${service.benefits.join(', ')}` : ''}${service.includes ? `. Includes: ${service.includes.join(', ')}` : ''}.`,
      priority: 9,
      tags: [nameLower, 'service', 'pricing']
    });
    
    // Duration-specific
    service.prices.forEach(price => {
      qaEntries.push({
        key: `${nameLower} ${price.duration} minutes min price`,
        value: `${service.name} ${price.duration}min: ₹${price.price}. ${service.description}`,
        priority: 7,
        tags: [nameLower, `${price.duration}min`]
      });
    });
  });
  
  // 5. General Q&A
  const allServices = [...commonServices];
  activeSpas.forEach(spa => {
    if (spa.services) {
      allServices.push(...spa.services);
    }
  });
  const uniqueServices = [...new Set(allServices.map(s => s.name))];
  
  qaEntries.push({
    key: 'services what available offer have menu',
    value: `We offer: ${uniqueServices.join(', ')}. Available across our ${activeSpas.length} spa center${activeSpas.length > 1 ? 's' : ''}. What would you like to try?`,
    priority: 10,
    tags: ['services', 'menu', 'offerings']
  });
  
  // 6. Information not available - redirect to website
  qaEntries.push({
    key: 'information not available details more visit website',
    value: `For detailed information about specific services, packages, or special requests, please visit our website: ${websiteUrl}. You can also call any of our branches directly for personalized assistance!`,
    priority: 8,
    tags: ['website', 'more info', 'details']
  });
  
  // 7. Booking and general FAQs
  qaEntries.push({
    key: 'how to book appointment reservation booking',
    value: `Book your spa session: Call us, WhatsApp, or visit ${websiteUrl}. We recommend booking in advance, especially for couple treatments and weekends. Walk-ins welcome based on availability!`,
    priority: 10,
    tags: ['booking', 'appointment', 'reservation']
  });
  
  qaEntries.push({
    key: 'payment methods cash card upi accepted',
    value: 'We accept Cash, Credit/Debit Cards, and UPI (GPay, PhonePe, Paytm). No extra charges for digital payments!',
    priority: 7,
    tags: ['payment', 'methods']
  });
  
  qaEntries.push({
    key: 'first time new customer what to expect visit',
    value: 'First visit: Arrive 10-15min early. We provide robes/towels. Our therapist will discuss your preferences and health concerns. Choose your service and duration. Relax and enjoy your spa experience!',
    priority: 7,
    tags: ['first time', 'new customer']
  });
  
  // 8. Persuasive messages for interested customers
  qaEntries.push({
    key: 'thinking maybe later not sure',
    value: 'I understand! Take your time. Our spa treatments are designed to provide ultimate relaxation and wellness. Many first-time guests are amazed at the transformation. We have special first-visit discounts too! Would you like to know more about any specific service?',
    priority: 8,
    tags: ['hesitant', 'persuasion', 'thinking']
  });
  
  qaEntries.push({
    key: 'expensive costly too much money',
    value: 'We offer excellent value for premium spa experiences! We have packages starting from ₹1499, and special offers for first-time visitors. Think of it as an investment in your health and wellness. Plus, the benefits last for days! Would you like to know about our budget-friendly options?',
    priority: 8,
    tags: ['expensive', 'price concern', 'persuasion']
  });
  
  qaEntries.push({
    key: 'benefits why should i advantages worth it',
    value: 'Spa treatments offer: Stress relief, better sleep, pain management, improved circulation, glowing skin, mental clarity, and overall wellness. Regular spa sessions boost both physical and mental health. It\'s self-care that pays long-term dividends! Shall I help you choose the perfect treatment?',
    priority: 9,
    tags: ['benefits', 'why', 'advantages', 'persuasion']
  });
  
  // 9. Graceful exit responses
  qaEntries.push({
    key: 'not interested no thanks not now',
    value: `No problem at all! Thank you for your time. If you ever need relaxation and wellness, we're here to serve you. Feel free to reach out anytime. Visit ${websiteUrl} for more info. Have a wonderful day! 🙏`,
    priority: 10,
    tags: ['not interested', 'exit', 'polite']
  });
  
  return qaEntries;
}

// ============================================
// SEED FUNCTION
// ============================================

async function seedMultiSpaCenters() {
  try {
    console.log('🌱 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-broadcast');
    console.log('✅ Connected to MongoDB');

    const user = await User.findOne();
    
    if (!user) {
      console.error('❌ No users found. Please create a user first.');
      process.exit(1);
    }

    console.log(`👤 Using user: ${user.email}`);

    // Delete old data
    const deletedCount = await ReplyData.deleteMany({
      userId: user._id,
      category: 'spa_salon'
    });

    if (deletedCount.deletedCount > 0) {
      console.log(`🗑️  Deleted ${deletedCount.deletedCount} old entries`);
    }

    // Generate Q&A
    console.log('🤖 Auto-generating Q&A from spa centers data...');
    const qaData = generateMultiSpaQA(spaCenters, commonServices);

    // Create knowledge base
    console.log('📝 Creating multi-spa knowledge base...');
    const activeSpas = spaCenters.filter(s => s.active);
    
    const replyData = new ReplyData({
      name: 'Multi-Spa Centers - Complete Guide',
      description: `Auto-generated from ${activeSpas.length} spa center(s) with ${commonServices.length} services`,
      category: 'spa_salon',
      dataType: 'manual_entry',
      isActive: true,
      data: qaData,
      userId: user._id,
      statistics: {
        totalQueries: 0,
        successfulMatches: 0
      }
    });

    await replyData.save();
    console.log('✅ Multi-spa knowledge base created!');

    console.log(`\n📊 Data Summary:`);
    console.log(`   - Active Spa Centers: ${activeSpas.length}`);
    activeSpas.forEach((spa, idx) => {
      console.log(`     ${idx + 1}. ${spa.spaName} - ${spa.locationName}`);
      console.log(`        Address: ${spa.address}, ${spa.city}`);
      console.log(`        Contact: ${spa.contactNumber || 'N/A'}`);
      console.log(`        Amenities: ${spa.amenities?.length || 0}`);
      console.log(`        Offers: ${spa.offers?.length || 0}`);
    });
    console.log(`   - Common Services: ${commonServices.length}`);
    console.log(`   - Auto-Generated Q&A: ${qaData.length}`);
    console.log(`   - Website: https://spaadvisor.in/`);
    console.log(`\n✨ System includes persuasive messaging and graceful exits!`);
    console.log(`\n🎉 Seeding completed!`);

    await mongoose.connection.close();
    console.log('👋 Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the seed function
seedMultiSpaCenters();

