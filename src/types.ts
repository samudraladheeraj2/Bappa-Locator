export interface YearlyPandalPhoto {
  id: string;
  pandalId?: string;
  pandalName?: string;
  url: string;
  year: number; // e.g. 2026
  uploadedBy: string; // user UID or phone
  uploaderName: string; // e.g. "Ramesh G.", "Devotee"
  votesCount: number; // community upvotes / likes count
  votedUserIds?: string[]; // IDs/Tokens of users who voted
  createdAt: string; // ISO string
  exifDate?: string;
  isLiveCapture?: boolean;
  isCover?: boolean;
  status?: 'pending' | 'approved' | 'rejected';
}

export interface Pandal {
  id: string;
  sourceId?: string;
  name: string;
  committeeName?: string;
  associationName?: string;
  organizerName?: string;
  contactPerson?: string;
  contactNumber?: string;
  contactInfo?: string;
  phone?: string;
  address: string;
  area: string;
  city: string;
  state?: string;
  latitude: number;
  longitude: number;
  timings?: string;
  description?: string;
  image?: string; // Main cover photo (Lord Ganesha idol)
  ganeshaImage?: string; // Photo of Lord Ganesha Idol
  pandalImage?: string; // Photo of Pandal / Mandapam setup & lighting
  extraImages?: string[];
  photos?: string[];
  yearlyPhotos?: YearlyPandalPhoto[];
  annadanamDate?: string;
  servingTime?: string;
  isOnlyAnnadanam?: boolean;
  nimajjanamDate?: string;
  ownerName?: string;
  ownerInfo?: string;
  submittedBy?: string;
  submittedByEmail?: string;
  status?: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
  popular?: boolean;
}

export interface Annadanam {
  id: string;
  sourceId?: string;
  pandalName: string;
  date: string;
  startTime: string;
  endTime: string;
  address: string;
  area: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  photos?: string[];
  image?: string;
  description?: string;
  contactInfo?: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedBy: string;
  submittedByEmail?: string;
  createdAt: string;
}

export type ViewMode = 'map' | 'list' | 'annadanam';
