-- Enable realtime for pending_weighs table
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_weighs;

-- Enable realtime for payments table
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;