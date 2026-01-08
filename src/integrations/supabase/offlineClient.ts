import { supabase } from './client';
import offlineDataManager from '@/lib/offlineDataManager';

interface OfflineSupabaseClient {
  from: (table: string) => OfflineTable;
}

interface OfflineTable {
  select: (columns?: string) => OfflineQueryBuilder;
  insert: (data: any) => OfflineQueryBuilder;
  update: (data: any) => OfflineQueryBuilder;
  upsert: (data: any) => OfflineQueryBuilder;
  delete: () => OfflineQueryBuilder;
}

interface OfflineQueryBuilder {
  eq: (column: string, value: any) => OfflineQueryBuilder;
  neq: (column: string, value: any) => OfflineQueryBuilder;
  gt: (column: string, value: any) => OfflineQueryBuilder;
  gte: (column: string, value: any) => OfflineQueryBuilder;
  lt: (column: string, value: any) => OfflineQueryBuilder;
  lte: (column: string, value: any) => OfflineQueryBuilder;
  like: (column: string, pattern: string) => OfflineQueryBuilder;
  ilike: (column: string, pattern: string) => OfflineQueryBuilder;
  is: (column: string, value: any) => OfflineQueryBuilder;
  in: (column: string, values: any[]) => OfflineQueryBuilder;
  contains: (column: string, value: any) => OfflineQueryBuilder;
  range: (range: [number, number]) => Promise<any>;
  single: () => Promise<any>;
  maybeSingle: () => Promise<any>;
  limit: (count: number) => OfflineQueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => OfflineQueryBuilder;
  range: (from: number, to: number) => OfflineQueryBuilder;
  execute: () => Promise<any>;
}

class OfflineQueryBuilder implements OfflineQueryBuilder {
  private queryBuilder: any;
  private table: string;
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | null = null;
  private operationData: any = null;
  private filters: Array<{ method: string; args: any[] }> = [];

  constructor(table: string, operation?: 'select' | 'insert' | 'update' | 'delete' | 'upsert', data?: any) {
    this.table = table;
    this.operation = operation;
    this.operationData = data;
  }

  // Filter methods
  eq(column: string, value: any): OfflineQueryBuilder {
    this.filters.push({ method: 'eq', args: [column, value] });
    return this;
  }

  neq(column: string, value: any): OfflineQueryBuilder {
    this.filters.push({ method: 'neq', args: [column, value] });
    return this;
  }

  gt(column: string, value: any): OfflineQueryBuilder {
    this.filters.push({ method: 'gt', args: [column, value] });
    return this;
  }

  gte(column: string, value: any): OfflineQueryBuilder {
    this.filters.push({ method: 'gte', args: [column, value] });
    return this;
  }

  lt(column: string, value: any): OfflineQueryBuilder {
    this.filters.push({ method: 'lt', args: [column, value] });
    return this;
  }

  lte(column: string, value: any): OfflineQueryBuilder {
    this.filters.push({ method: 'lte', args: [column, value] });
    return this;
  }

  like(column: string, pattern: string): OfflineQueryBuilder {
    this.filters.push({ method: 'like', args: [column, pattern] });
    return this;
  }

  ilike(column: string, pattern: string): OfflineQueryBuilder {
    this.filters.push({ method: 'ilike', args: [column, pattern] });
    return this;
  }

  is(column: string, value: any): OfflineQueryBuilder {
    this.filters.push({ method: 'is', args: [column, value] });
    return this;
  }

  in(column: string, values: any[]): OfflineQueryBuilder {
    this.filters.push({ method: 'in', args: [column, values] });
    return this;
  }

  contains(column: string, value: any): OfflineQueryBuilder {
    this.filters.push({ method: 'contains', args: [column, value] });
    return this;
  }

  limit(count: number): OfflineQueryBuilder {
    this.filters.push({ method: 'limit', args: [count] });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): OfflineQueryBuilder {
    this.filters.push({ method: 'order', args: [column, options] });
    return this;
  }

  range(from: number, to: number): OfflineQueryBuilder {
    this.filters.push({ method: 'range', args: [from, to] });
    return this;
  }

  // Result methods
  async single(): Promise<any> {
    if (navigator.onLine) {
      // Execute the actual query if online
      let query = supabase.from(this.table).select();
      
      // Apply filters
      for (const filter of this.filters) {
        // @ts-ignore - We're dynamically calling methods
        query = query[filter.method](...filter.args);
      }
      
      return await query.single();
    } else {
      // If offline, return a simulated response or cached data
      return { data: null, error: null };
    }
  }

  async maybeSingle(): Promise<any> {
    if (navigator.onLine) {
      // Execute the actual query if online
      let query = supabase.from(this.table).select();
      
      // Apply filters
      for (const filter of this.filters) {
        // @ts-ignore - We're dynamically calling methods
        query = query[filter.method](...filter.args);
      }
      
      return await query.maybeSingle();
    } else {
      // If offline, return a simulated response or cached data
      return { data: null, error: null };
    }
  }

  async execute(): Promise<any> {
    if (navigator.onLine) {
      // Execute the actual query if online
      let query;
      
      switch (this.operation) {
        case 'select':
          query = supabase.from(this.table).select();
          break;
        case 'insert':
          query = supabase.from(this.table).insert(this.operationData);
          break;
        case 'update':
          query = supabase.from(this.table).update(this.operationData);
          break;
        case 'delete':
          query = supabase.from(this.table).delete();
          break;
        case 'upsert':
          query = supabase.from(this.table).upsert(this.operationData);
          break;
        default:
          throw new Error('Operation not defined');
      }
      
      // Apply filters
      for (const filter of this.filters) {
        // @ts-ignore - We're dynamically calling methods
        query = query[filter.method](...filter.args);
      }
      
      return await query;
    } else {
      // If offline, store the operation
      const result = await offlineDataManager.handleOfflineOperation(
        this.getOperationType(this.table),
        this.operation as 'create' | 'update' | 'delete',
        this.operationData,
        this.table
      );
      
      // Return a simulated success response
      return {
        data: result.offlineId ? { id: result.offlineId } : null,
        error: result.error ? { message: result.error } : null
      };
    }
  }

  private getOperationType(table: string): 'vehicle_entry' | 'weigh_record' | 'payment' | 'penalty' | 'other' {
    switch (table) {
      case 'vehicle_entries':
        return 'vehicle_entry';
      case 'weigh_records':
        return 'weigh_record';
      case 'payments':
        return 'payment';
      case 'penalties':
        return 'penalty';
      default:
        return 'other';
    }
  }
}

class OfflineTable implements OfflineTable {
  private tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns?: string): OfflineQueryBuilder {
    return new OfflineQueryBuilder(this.tableName, 'select');
  }

  insert(data: any): OfflineQueryBuilder {
    return new OfflineQueryBuilder(this.tableName, 'insert', data);
  }

  update(data: any): OfflineQueryBuilder {
    return new OfflineQueryBuilder(this.tableName, 'update', data);
  }

  upsert(data: any): OfflineQueryBuilder {
    return new OfflineQueryBuilder(this.tableName, 'upsert', data);
  }

  delete(): OfflineQueryBuilder {
    return new OfflineQueryBuilder(this.tableName, 'delete');
  }
}

class OfflineSupabaseClient implements OfflineSupabaseClient {
  from(table: string): OfflineTable {
    return new OfflineTable(table);
  }

  // Add auth methods if needed
  get auth() {
    return supabase.auth;
  }
}

export const offlineSupabase = new OfflineSupabaseClient();