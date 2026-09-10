import type { CategoryFact } from '../lib/category-facts';

/**
 * Khối hỏi–đáp ngắn ở cuối trang danh mục.
 *
 * Mỗi câu trả lời là một đoạn tự chứa, có số liệu và nêu rõ phạm vi — dạng đoạn mà
 * công cụ trả lời bằng AI trích được nguyên vẹn thay vì phải diễn giải. Toàn bộ nội
 * dung sinh từ dữ liệu tin đăng thật, không có câu chữ soạn sẵn nào.
 */
export function CategoryFacts({ facts, heading }: { facts: CategoryFact[]; heading: string }) {
  if (!facts || facts.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{heading}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.question}>
            <dt className="text-sm font-semibold text-slate-800">{fact.question}</dt>
            <dd className="mt-1 text-sm leading-6 text-slate-600">{fact.answer}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-5 text-slate-400">
        Số liệu tính trực tiếp từ tin đăng đang hiển thị tại thời điểm tải trang, cập nhật liên tục theo dữ liệu thật.
      </p>
    </section>
  );
}
