-- Table: schools (Master Data Sekolah)
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  region VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: profiles (Data Pengguna & Role)
-- Menggunakan Supabase Auth (auth.users) sebagai referensi ID
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'guru', 'operator', 'siswa')),
  full_name VARCHAR(255) NOT NULL,
  school_id UUID REFERENCES schools(id),
  class_name VARCHAR(50), -- Khusus siswa, misal: '6A'
  nisn VARCHAR(50) UNIQUE, -- Khusus siswa
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: questions (Bank Soal)
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL CHECK (type IN ('PG_Sederhana', 'PG_Kompleks', 'PG_Kategori')),
  mapel VARCHAR(100) NOT NULL,
  element VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  options JSONB NOT NULL, -- Array of choices / statements
  correct_answer JSONB NOT NULL,
  author_id UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: packages (Paket Try Out)
CREATE TABLE packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  mapel VARCHAR(100) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 90,
  navigation_mode VARCHAR(50) DEFAULT 'bebas', -- 'bebas' atau 'maju_terus'
  release_score_mode VARCHAR(50) DEFAULT 'langsung', -- 'langsung' atau 'ditunda'
  status VARCHAR(50) DEFAULT 'draft', -- 'draft' atau 'aktif'
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: package_questions (Relasi Paket dan Soal)
CREATE TABLE package_questions (
  package_id UUID REFERENCES packages(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, question_id)
);

-- Table: exam_sessions (Sesi Ujian Siswa)
CREATE TABLE exam_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  package_id UUID REFERENCES packages(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'sedang_mengerjakan', -- 'belum', 'sedang_mengerjakan', 'selesai'
  start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP WITH TIME ZONE,
  total_score DECIMAL(5,2),
  UNIQUE (student_id, package_id)
);

-- Table: answers (Jawaban Siswa per Soal)
CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id),
  answer_data JSONB NOT NULL,
  is_correct BOOLEAN,
  UNIQUE (session_id, question_id)
);

-- Row Level Security (RLS) Setup
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
