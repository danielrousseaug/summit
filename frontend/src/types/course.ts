export type Course = {
  id: number;
  title: string;
  source_filename?: string | null;
  created_at: string;
};

export type SyllabusItem = {
  id: number;
  order_index: number;
  title: string;
  summary: string;
};

export type CourseWithSyllabus = Course & { syllabus: SyllabusItem[] };
