import React from 'react';

interface ClientInfoCardProps {
  clientName: string;
  onClientNameChange: (value: string) => void;
  orderName: string;
  onOrderNameChange: (value: string) => void;
}

/**
 * Client & order information card.
 *
 * Two text inputs for capturing the customer name and order/project name
 * associated with the current quotation.
 */
const ClientInfoCard: React.FC<ClientInfoCardProps> = ({
  clientName,
  onClientNameChange,
  orderName,
  onOrderNameChange,
}) => {
  return (
    <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-12 -mt-12" />
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
        客户与订单基本信息
      </h3>
      <div className="space-y-3 relative z-10">
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">
            客户姓名/称呼
          </label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => onClientNameChange(e.target.value)}
            placeholder="例如：李老板、南山张总"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">
            订单/项目名称
          </label>
          <input
            type="text"
            value={orderName}
            onChange={(e) => onOrderNameChange(e.target.value)}
            placeholder="例如：天阅公馆1002号房切框"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
          />
        </div>
      </div>
    </section>
  );
};

export default ClientInfoCard;
