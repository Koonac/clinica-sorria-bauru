<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedAdmin();
        $this->seedDeveloper();
    }

    private function seedAdmin(): void
    {
        $admin = User::query()->where('username', 'Admin')->first()
            ?? User::query()->where('email', 'admin@vekta.local')->first();

        if (! $admin) {
            $senha = Str::password(24);

            $admin = User::query()->create([
                'username' => 'Admin',
                'name' => 'Admin',
                'email' => 'admin@vekta.local',
                'role' => User::ROLE_ADMIN,
                'password' => $senha,
            ]);

            $this->command?->warn('Admin criado. Guarde as credenciais (a senha não será exibida de novo):');
            $this->command?->line('User: Admin');
            $this->command?->line('Senha: ' . $senha);
        } else {
            $admin->forceFill([
                'username' => 'Admin',
                'name' => 'Admin',
                'role' => User::ROLE_ADMIN,
            ])->save();

            $this->command?->info('Admin já existe (User: Admin). Use a rota de alteração de senha se precisar trocar.');
        }

        // Token de serviço da interface Vekta (uma vez por instalação).
        if (! $admin->tokens()->where('name', 'interface')->exists()) {
            $token = $admin->createToken('interface')->plainTextToken;

            $this->command?->warn('Token de serviço da interface (guarde — não será exibido de novo):');
            $this->command?->line($token);
            $this->command?->info('Defina BACKEND_API_TOKEN com esse valor em "vekta-ai/interface/.env".');
        }
    }

    private function seedDeveloper(): void
    {
        $developer = User::query()->where('username', 'henrique')->first()
            ?? User::query()->where('email', 'henrique@dev.com')->first()
            ?? User::query()->where('username', 'Developer')->first()
            ?? User::query()->where('email', 'developer@vekta.local')->first();

        if (! $developer) {
            $senha = Str::password(24);

            User::query()->create([
                'username' => 'henrique',
                'name' => 'Henrique',
                'email' => 'henrique@dev.com',
                'role' => User::ROLE_DEVELOPER,
                'password' => $senha,
            ]);

            $this->command?->warn('Developer criado. Guarde as credenciais (a senha não será exibida de novo):');
            $this->command?->line('User: henrique');
            $this->command?->line('Senha: '.$senha);
        } else {
            $developer->forceFill([
                'username' => 'henrique',
                'name' => 'Henrique',
                'role' => User::ROLE_DEVELOPER,
            ])->save();

            $this->command?->info('Developer já existe (User: henrique). Use a rota de alteração de senha se precisar trocar.');
        }
    }
}
