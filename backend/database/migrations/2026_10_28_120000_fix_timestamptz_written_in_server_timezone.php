<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Corrige datas em colunas timestamptz gravadas enquanto a sessão do Postgres usava o fuso padrão do
 * servidor (UTC no Docker) em vez do fuso do app (America/Sao_Paulo): o Laravel envia a hora local sem
 * offset, então "09:39" de Brasília foi salvo como 09:39 UTC (3h antes do real).
 *
 * Só desloca quando o fuso padrão do servidor difere do fuso do app; onde já eram iguais (ex.: banco
 * local configurado em São Paulo) não faz nada. Precisa rodar junto com o 'timezone' em config/database.php.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->shift(1);
    }

    public function down(): void
    {
        $this->shift(-1);
    }

    private function shift(int $direction): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        $appTz = (string) config('app.timezone');
        // reset_val = fuso padrão do servidor/banco, ignorando o SET TIME ZONE feito pela conexão.
        $serverTz = (string) DB::selectOne("select reset_val from pg_settings where name = 'TimeZone'")->reset_val;

        $diff = (float) DB::selectOne(
            'select extract(epoch from (now() at time zone ?) - (now() at time zone ?)) as diff',
            [$appTz, $serverTz],
        )->diff;

        if ((int) round($diff) === 0) {
            return;
        }

        // Hora local do app − hora do servidor (ex.: -10800 para Brasília x UTC): subtrair corrige.
        $seconds = -$diff * $direction;

        $columns = DB::select(
            "select table_name, column_name from information_schema.columns
             where table_schema = current_schema() and data_type = 'timestamp with time zone'"
        );

        foreach ($columns as $column) {
            $table = '"'.str_replace('"', '""', $column->table_name).'"';
            $name = '"'.str_replace('"', '""', $column->column_name).'"';
            DB::update(
                "update {$table} set {$name} = {$name} + make_interval(secs => ?) where {$name} is not null",
                [$seconds],
            );
        }
    }
};
