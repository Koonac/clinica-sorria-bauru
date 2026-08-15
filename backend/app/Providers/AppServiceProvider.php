<?php

namespace App\Providers;

use App\Support\ClinicContext;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // scoped (e não singleton): o worker de fila só descarta instâncias scoped
        // entre jobs, então um singleton manteria a clínica do job anterior.
        $this->app->scoped(ClinicContext::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
