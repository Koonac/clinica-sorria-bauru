<?php

namespace Database\Seeders;

use App\Models\Finance\FinancialAccount;
use Illuminate\Database\Seeder;

class FinanceSeeder extends Seeder
{
    /** Plano de contas inicial (idempotente: chaveado por `code`). */
    public function run(): void
    {
        $plano = [
            ['code' => '1', 'name' => 'Receitas', 'type' => 'receita', 'parent' => null],
            ['code' => '1.1', 'name' => 'Vendas de serviço', 'type' => 'receita', 'parent' => '1'],
            ['code' => '1.2', 'name' => 'Vendas de produto', 'type' => 'receita', 'parent' => '1'],
            ['code' => '1.3', 'name' => 'Outras receitas', 'type' => 'receita', 'parent' => '1'],

            ['code' => '2', 'name' => 'Despesas', 'type' => 'despesa', 'parent' => null],
            ['code' => '2.1', 'name' => 'Pessoal', 'type' => 'despesa', 'parent' => '2'],
            ['code' => '2.2', 'name' => 'Marketing', 'type' => 'despesa', 'parent' => '2'],
            ['code' => '2.3', 'name' => 'Operacional', 'type' => 'despesa', 'parent' => '2'],
            ['code' => '2.4', 'name' => 'Impostos e taxas', 'type' => 'despesa', 'parent' => '2'],
            ['code' => '2.5', 'name' => 'Outras despesas', 'type' => 'despesa', 'parent' => '2'],
        ];

        $idsPorCodigo = [];

        foreach ($plano as $posicao => $conta) {
            $registro = FinancialAccount::updateOrCreate(
                ['code' => $conta['code']],
                [
                    'name' => $conta['name'],
                    'type' => $conta['type'],
                    'parent_id' => $conta['parent'] ? ($idsPorCodigo[$conta['parent']] ?? null) : null,
                    'position' => $posicao,
                    'active' => true,
                ],
            );

            $idsPorCodigo[$conta['code']] = $registro->id;
        }
    }
}
