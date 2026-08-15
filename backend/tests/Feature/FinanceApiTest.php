<?php

namespace Tests\Feature;

use App\Models\Finance\FinancialAccount;
use App\Models\Finance\FinancialEntry;
use App\Models\User;
use Database\Seeders\FinanceSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FinanceApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(FinanceSeeder::class);
    }

    private function autenticar(): User
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        return $user;
    }

    private function conta(string $code): FinancialAccount
    {
        return FinancialAccount::where('code', $code)->firstOrFail();
    }

    public function test_exige_autenticacao(): void
    {
        $this->getJson('/api/v1/finance/entries')->assertUnauthorized();
    }

    public function test_lista_plano_de_contas_em_arvore(): void
    {
        $this->autenticar();

        $resposta = $this->getJson('/api/v1/finance/accounts?tree=1')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.code', '1')
            ->json('data');

        $this->assertCount(3, $resposta[0]['children']);
        $this->assertSame('1.1', $resposta[0]['children'][0]['code']);
    }

    public function test_cria_subconta_e_recusa_pai_ciclico(): void
    {
        $this->autenticar();
        $despesas = $this->conta('2');

        $nova = $this->postJson('/api/v1/finance/accounts', [
            'code' => '2.2.1',
            'name' => 'Anúncios',
            'type' => 'despesa',
            'parent_id' => $this->conta('2.2')->id,
        ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Anúncios')
            ->json('data');

        // Mover "Despesas" para debaixo da própria neta fecharia um ciclo.
        $this->patchJson('/api/v1/finance/accounts/'.$despesas->id, ['parent_id' => $nova['id']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');
    }

    public function test_nao_exclui_conta_com_subcontas_ou_lancamentos(): void
    {
        $this->autenticar();

        $this->deleteJson('/api/v1/finance/accounts/'.$this->conta('2')->id)
            ->assertStatus(422);

        $marketing = $this->conta('2.2');
        FinancialEntry::create([
            'direction' => 'payable',
            'description' => 'Impulsionamento',
            'amount' => 250,
            'due_date' => now()->toDateString(),
            'account_id' => $marketing->id,
        ]);

        $this->deleteJson('/api/v1/finance/accounts/'.$marketing->id)
            ->assertStatus(422);

        $vazia = $this->conta('2.5');
        $this->deleteJson('/api/v1/finance/accounts/'.$vazia->id)
            ->assertOk()
            ->assertJsonPath('data.id', $vazia->id);
    }

    public function test_cria_lancamento_parcelado_dividindo_centavos_sem_sobra(): void
    {
        $this->autenticar();

        $parcelas = $this->postJson('/api/v1/finance/entries', [
            'direction' => 'payable',
            'description' => 'Aluguel',
            'amount' => 1000,
            'due_date' => '2026-09-05',
            'installments' => 3,
            'account_id' => $this->conta('2.3')->id,
        ])
            ->assertCreated()
            ->assertJsonCount(3, 'data')
            ->json('data');

        $this->assertSame([1, 2, 3], array_column($parcelas, 'installment_number'));
        $this->assertSame(
            ['2026-09-05', '2026-10-05', '2026-11-05'],
            array_column($parcelas, 'due_date'),
        );
        $this->assertCount(1, array_unique(array_column($parcelas, 'installment_group')));

        $soma = array_sum(array_map(fn ($p) => (float) $p['amount'], $parcelas));
        $this->assertEqualsWithDelta(1000.00, $soma, 0.001);
        $this->assertEqualsWithDelta(333.34, (float) $parcelas[2]['amount'], 0.001);
    }

    public function test_baixa_e_estorna_lancamento(): void
    {
        $this->autenticar();

        $entrada = $this->postJson('/api/v1/finance/entries', [
            'direction' => 'receivable',
            'description' => 'Mensalidade',
            'amount' => 1200,
            'due_date' => now()->addDays(3)->toDateString(),
            'account_id' => $this->conta('1.1')->id,
        ])->assertCreated()->json('data.0');

        $this->postJson('/api/v1/finance/entries/'.$entrada['id'].'/settle', [
            'payment_method' => 'pix',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.payment_method', 'pix')
            ->assertJsonPath('data.paid_amount', '1200.00');

        $this->deleteJson('/api/v1/finance/entries/'.$entrada['id'].'/settle')
            ->assertOk()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.paid_at', null);
    }

    public function test_marca_pendente_vencido_e_filtra_por_direcao(): void
    {
        $this->autenticar();

        FinancialEntry::create([
            'direction' => 'payable',
            'description' => 'Boleto atrasado',
            'amount' => 90,
            'due_date' => now()->subDays(5)->toDateString(),
        ]);
        FinancialEntry::create([
            'direction' => 'receivable',
            'description' => 'A receber futuro',
            'amount' => 500,
            'due_date' => now()->addDays(20)->toDateString(),
        ]);

        $this->getJson('/api/v1/finance/entries?direction=payable')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.overdue', true);

        $this->getJson('/api/v1/finance/entries?direction=receivable')
            ->assertOk()
            ->assertJsonPath('data.0.overdue', false);

        $this->getJson('/api/v1/finance/entries?overdue=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.description', 'Boleto atrasado');
    }

    public function test_overview_projeta_previsto_pela_data_de_vencimento(): void
    {
        $this->autenticar();

        $mes = now(config('app.timezone'))->startOfMonth();

        // Datas ancoradas no início do mês: o teste não muda de comportamento
        // conforme o dia em que roda.
        FinancialEntry::create([
            'direction' => 'receivable',
            'description' => 'Receita deste mês',
            'amount' => 800,
            'due_date' => $mes->copy()->addDays(10)->toDateString(),
        ]);
        FinancialEntry::create([
            'direction' => 'payable',
            'description' => 'Despesa do mês que vem',
            'amount' => 300,
            'due_date' => $mes->copy()->addMonthNoOverflow()->addDays(3)->toDateString(),
        ]);
        FinancialEntry::create([
            'direction' => 'payable',
            'description' => 'Cancelada, fora da projeção',
            'amount' => 9999,
            'due_date' => $mes->copy()->addDays(4)->toDateString(),
            'status' => 'canceled',
        ]);

        $previsto = $this->getJson('/api/v1/finance/stats/overview')
            ->assertOk()
            ->assertJsonCount(6, 'previsto')
            ->json('previsto');

        // Olha para frente: começa no mês corrente.
        $this->assertSame($mes->format('Y-m'), $previsto[0]['month']);
        $this->assertEqualsWithDelta(800, $previsto[0]['receber'], 0.001);
        $this->assertEqualsWithDelta(0, $previsto[0]['pagar'], 0.001);
        $this->assertEqualsWithDelta(300, $previsto[1]['pagar'], 0.001);
    }

    public function test_overview_soma_kpis_do_dashboard(): void
    {
        $this->autenticar();

        FinancialEntry::create([
            'direction' => 'payable',
            'description' => 'Aberto',
            'amount' => 300,
            'due_date' => now()->addDays(10)->toDateString(),
        ]);
        FinancialEntry::create([
            'direction' => 'payable',
            'description' => 'Vencido',
            'amount' => 200,
            'due_date' => now()->subDays(2)->toDateString(),
        ]);
        FinancialEntry::create([
            'direction' => 'receivable',
            'description' => 'Recebido no mês',
            'amount' => 1000,
            'due_date' => now()->toDateString(),
            'status' => 'paid',
            'paid_at' => now(),
            'paid_amount' => 1000,
            'account_id' => $this->conta('1.1')->id,
        ]);

        $resposta = $this->getJson('/api/v1/finance/stats/overview')
            ->assertOk()
            ->assertJsonCount(6, 'serie')
            // Só o vencido entra na janela de 7 dias; o de +10 dias fica de fora.
            ->assertJsonCount(1, 'proximos')
            ->assertJsonPath('proximos.0.description', 'Vencido')
            ->assertJsonPath('por_conta.0.code', '1.1')
            ->json();

        // Números JSON chegam como int ou float conforme a serialização; compara pelo valor.
        $this->assertEqualsWithDelta(500, $resposta['kpis']['a_pagar_aberto'], 0.001);
        $this->assertEqualsWithDelta(200, $resposta['kpis']['vencidos_pagar'], 0.001);
        $this->assertEqualsWithDelta(1000, $resposta['kpis']['recebido_mes'], 0.001);
        $this->assertEqualsWithDelta(0, $resposta['kpis']['pago_mes'], 0.001);
        $this->assertEqualsWithDelta(1000, $resposta['kpis']['saldo_mes'], 0.001);

        $mesAtual = now(config('app.timezone'))->format('Y-m');
        $ultimo = end($resposta['serie']);
        $this->assertSame($mesAtual, $ultimo['month']);
        $this->assertEqualsWithDelta(1000, $ultimo['receber'], 0.001);
    }
}
