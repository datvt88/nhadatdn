import type { Metadata } from 'next';
import Link from 'next/link';
import { toAbsoluteUrl } from '../../../lib/seo';

export const metadata: Metadata = {
  title: 'Chính sách đổi trả và hoàn tiền',
  description:
    'Chính sách đổi trả, hoàn tiền và xử lý yêu cầu liên quan đến tin đăng bất động sản trên NhadatDN.',
  alternates: {
    canonical: toAbsoluteUrl('/return-policy'),
  },
  openGraph: {
    title: 'Chính sách đổi trả và hoàn tiền | NhadatDN',
    description:
      'Thông tin công khai về chính sách đổi trả, hoàn tiền và kênh hỗ trợ của NhadatDN cho Merchant Center.',
    url: toAbsoluteUrl('/return-policy'),
    type: 'website',
  },
};

const policySections = [
  {
    title: 'Phạm vi áp dụng',
    body: [
      'NhadatDN là nền tảng đăng tin và tìm kiếm bất động sản tại Đà Nẵng. Các tin đăng bất động sản trên website không phải hàng hóa vật lý được giao nhận, nên không áp dụng đổi trả hàng hóa theo hình thức gửi trả sản phẩm.',
      'Chính sách này áp dụng cho các dịch vụ số trên NhadatDN nếu có phát sinh thanh toán trực tiếp, bao gồm gói đăng tin, gói hiển thị ưu tiên, Bean hoặc các dịch vụ quảng bá tin đăng tương đương.',
    ],
  },
  {
    title: 'Đổi trả và trao đổi dịch vụ',
    body: [
      'Do dịch vụ được cung cấp dưới dạng hiển thị tin đăng trực tuyến, NhadatDN không thực hiện đổi trả hàng hóa vật lý và không có phương thức gửi trả qua bưu điện, điểm nhận hàng hoặc cửa hàng.',
      'Nếu gói dịch vụ chưa được kích hoạt, khách hàng có thể yêu cầu đổi sang gói đăng tin tương đương hoặc yêu cầu hỗ trợ điều chỉnh trước khi tin được duyệt/hiển thị.',
    ],
  },
  {
    title: 'Các trường hợp có thể hoàn tiền',
    body: [
      'Yêu cầu hoàn tiền được xem xét khi giao dịch bị trừ trùng lặp, thanh toán thành công nhưng gói dịch vụ không được kích hoạt, lỗi kỹ thuật từ NhadatDN làm dịch vụ không được cung cấp, hoặc tin đăng bị từ chối do lỗi xử lý của hệ thống.',
      'Khách hàng nên gửi yêu cầu trong vòng 7 ngày kể từ ngày phát sinh giao dịch để NhadatDN đối soát đầy đủ dữ liệu thanh toán và trạng thái tin đăng.',
    ],
  },
  {
    title: 'Các trường hợp không hoàn tiền',
    body: [
      'NhadatDN không hoàn tiền cho giao dịch bất động sản thực tế giữa người đăng tin và người liên hệ, vì các bên tự thỏa thuận và thực hiện ngoài nền tảng.',
      'Phí dịch vụ thường không được hoàn lại khi tin đã được duyệt, đã hiển thị, đã sử dụng quyền lợi ưu tiên, hoặc nội dung bị gỡ/từ chối do vi phạm quy định đăng tin, thông tin sai sự thật, trùng lặp, lừa đảo hay không phù hợp pháp luật.',
    ],
  },
  {
    title: 'Thời gian và phương thức xử lý',
    body: [
      'Sau khi nhận đủ thông tin, NhadatDN thông thường phản hồi kết quả đối soát trong 3-5 ngày làm việc. Nếu yêu cầu được chấp thuận, khoản hoàn tiền sẽ được thực hiện về phương thức thanh toán ban đầu hoặc bằng Bean/tin đăng tương đương theo thỏa thuận với khách hàng.',
      'Thời gian tiền về tài khoản có thể phụ thuộc vào ngân hàng, ví điện tử hoặc cổng thanh toán, thông thường trong 7-14 ngày làm việc sau khi NhadatDN hoàn tất lệnh hoàn.',
    ],
  },
];

export default function ReturnPolicyPage() {
  return (
    <>
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-2xl font-extrabold leading-none text-slate-950" aria-label="NhadatDN">
            NhadatDN
          </Link>
          <nav className="flex items-center gap-4 text-sm font-semibold text-slate-700 sm:text-base" aria-label="Main">
            <Link className="hover:text-[var(--brand-primary)]" href="/mua-ban-nha-dat">
              Nhà đất bán
            </Link>
            <Link className="hover:text-[var(--brand-primary)]" href="/cho-thue-nha-dat">
              Nhà đất cho thuê
            </Link>
          </nav>
        </div>
      </header>
      <main className="bg-slate-50">
        <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase text-[var(--brand-primary)]">NhadatDN</p>
            <h1 className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">Chính sách đổi trả và hoàn tiền</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-700">
              Trang này công khai cách NhadatDN tiếp nhận và xử lý các yêu cầu đổi trả, hoàn tiền liên quan đến tin đăng bất
              động sản và dịch vụ số trên website.
            </p>
            <p className="mt-2 text-sm text-slate-500">Cập nhật lần cuối: 26/05/2026</p>
          </div>

          <div className="space-y-5">
            {policySections.map((section) => (
              <section key={section.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-950">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700 sm:text-base sm:leading-7">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950">Cách gửi yêu cầu hỗ trợ</h2>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700 sm:text-base sm:leading-7">
                <p>
                  Khi cần đối soát hoặc yêu cầu hoàn tiền, vui lòng gửi mã tin đăng, email tài khoản, thời gian giao dịch,
                  số tiền/số Bean liên quan và hình ảnh biên lai nếu có.
                </p>
                <p>
                  Email hỗ trợ:{' '}
                  <a className="font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline" href="mailto:cus@nhadatdn.net">
                    cus@nhadatdn.net
                  </a>
                  . Hotline:{' '}
                  <a className="font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline" href="tel:+84789021022">
                    0789.021.022
                  </a>
                  .
                </p>
              </div>
            </section>
          </div>
        </section>
      </main>
    </>
  );
}
